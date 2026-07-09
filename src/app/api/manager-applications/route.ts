import { NextResponse } from "next/server";
import type { DemoApplicantRow } from "@/data/demo-portal";
import { linkResidentOnApplicationSubmit } from "@/lib/auth/link-resident-on-application-submit";
import { isAdminUser } from "@/lib/auth/admin-preview";
import { managerHasCoManagerPermissionForProperty } from "@/lib/auth/manager-lease-scope";
import { linkedOwnerForProperty, linkedPropertyIdsForModule } from "@/lib/auth/co-manager-module-scope";
import { provisionApprovedResidentAccount } from "@/lib/auth/provision-approved-resident";
import { normalizeApplicationAxisId } from "@/lib/manager-applications-storage";
import { tryAutoOrderScreening } from "@/lib/screening/order-screening";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

async function sessionUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

function normalizeRow(row: DemoApplicantRow): DemoApplicantRow {
  const propertyId = row.assignedPropertyId?.trim() || row.propertyId?.trim() || row.application?.propertyId?.trim() || "";
  const id = normalizeApplicationAxisId(row.id);
  return {
    ...row,
    id,
    propertyId: row.propertyId || propertyId || undefined,
    assignedPropertyId: row.assignedPropertyId || undefined,
    email: row.email?.trim().toLowerCase() || row.email,
  };
}

function idVariants(id: string): string[] {
  const trimmed = id.trim();
  const normalized = normalizeApplicationAxisId(trimmed);
  return [...new Set([trimmed, normalized].filter(Boolean))];
}

async function persistNormalizedRow(db: ReturnType<typeof createSupabaseServiceRoleClient>, oldId: string, row: DemoApplicantRow) {
  if (oldId !== row.id) {
    await db.from("manager_application_records").delete().eq("id", oldId);
  }
  await db.from("manager_application_records").upsert(
    {
      id: row.id,
      manager_user_id: row.managerUserId || null,
      resident_email: row.email?.trim().toLowerCase() || null,
      property_id: row.propertyId || row.application?.propertyId || null,
      assigned_property_id: row.assignedPropertyId || null,
      row_data: row,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (row.bucket === "approved") {
    try {
      const provisioned = await provisionApprovedResidentAccount(db, row);
      if (!provisioned.ok) {
        console.error("Approved application persisted but resident provisioning failed:", {
          applicationId: row.id,
          error: provisioned.error,
        });
      }
    } catch (error) {
      console.error("Approved application persisted but resident provisioning crashed:", {
        applicationId: row.id,
        error: error instanceof Error ? error.message : "Unknown provisioning error",
      });
    }
  }
}

async function resolvePortalRole(
  db: ReturnType<typeof createSupabaseServiceRoleClient>,
  user: NonNullable<Awaited<ReturnType<typeof sessionUser>>>,
) {
  const { data: profile } = await db.from("profiles").select("email, role").eq("id", user.id).maybeSingle();
  const role = String(profile?.role ?? user.user_metadata?.role ?? "").toLowerCase();
  const email = (profile?.email ?? user.email ?? "").trim().toLowerCase();
  return { role, email };
}

function isManagerPortalRole(role: string): boolean {
  return role === "manager" || role === "owner" || role === "pro";
}

async function assertManagerOrAdminWriteAccess(
  db: ReturnType<typeof createSupabaseServiceRoleClient>,
  user: NonNullable<Awaited<ReturnType<typeof sessionUser>>>,
): Promise<NextResponse | null> {
  if (await isAdminUser(user.id)) return null;
  const { role } = await resolvePortalRole(db, user);
  if (!isManagerPortalRole(role)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 403 });
  }
  return null;
}

/**
 * Resolve the owner a manager write should be attributed to, and whether it is
 * allowed. A role-only gate previously trusted the client-supplied
 * `managerUserId`, letting any manager persist rows under another manager's id
 * (cross-tenant write hole) and letting a read-only co-manager edit an owner's
 * applications/residents. Rules (non-admin):
 *  - New row or the caller's own row → forced to the caller (ignore any forged id).
 *  - A FOREIGN existing row (owned by a linked owner) → writable only with the
 *    applications OR residents EDIT grant on the row's property; owner preserved.
 */
async function resolveApplicationWriteOwner(
  db: ReturnType<typeof createSupabaseServiceRoleClient>,
  callerId: string,
  row: DemoApplicantRow,
): Promise<{ ok: boolean; owner: string | null }> {
  const ids = idVariants(String(row.id ?? ""));
  // Use .in() (parameterized) rather than interpolating the client-controlled id
  // variants into an .or() filter string. Fail CLOSED on a query error: treating
  // a transient failure as "no existing row" would attribute a foreign row to
  // the caller and skip the ownership check.
  const { data: existingRows, error: existingErr } = await db
    .from("manager_application_records")
    .select("manager_user_id, property_id, assigned_property_id")
    .in("id", ids)
    .limit(1);
  if (existingErr) return { ok: false, owner: null };
  const existing = existingRows?.[0];
  const existingOwner = existing?.manager_user_id ? String(existing.manager_user_id) : null;

  const canEditProperty = async (pid: string): Promise<boolean> =>
    Boolean(pid) &&
    ((await managerHasCoManagerPermissionForProperty(db, callerId, pid, "applications", "edit")) ||
      (await managerHasCoManagerPermissionForProperty(db, callerId, pid, "residents", "edit")));

  if (existingOwner) {
    if (existingOwner === callerId) return { ok: true, owner: callerId };
    // Foreign existing row: anchor the permission check on the STORED property,
    // never the client-supplied row (which could be spoofed to a property the
    // caller can edit). The owner is always preserved.
    const pid = String(existing?.property_id || existing?.assigned_property_id || "").trim();
    if (!pid) return { ok: false, owner: existingOwner };
    return { ok: await canEditProperty(pid), owner: existingOwner };
  }

  // New row: attribution follows the ACTUAL grant. If the property was assigned
  // to the caller by a linked owner, require edit and attribute the row to that
  // owner (so it lands in their queue); otherwise it is the caller's own new row.
  const pid = String(row.propertyId || row.application?.propertyId || row.assignedPropertyId || "").trim();
  const linkedOwner = pid ? await linkedOwnerForProperty(db, callerId, pid) : null;
  if (!linkedOwner) return { ok: true, owner: callerId };
  return { ok: await canEditProperty(pid), owner: linkedOwner };
}

async function fetchApplicationsForManagerUser(
  db: ReturnType<typeof createSupabaseServiceRoleClient>,
  userId: string,
) {
  // This route feeds BOTH the Applications and Residents tabs (the client filters
  // each tab by its own module grant). So a co-manager's linked rows are included
  // when EITHER `applications` OR `residents` is granted on the property — a
  // co-manager with neither grant gets none of the owner's linked rows.
  const [appIds, resIds] = await Promise.all([
    linkedPropertyIdsForModule(db, userId, "applications"),
    linkedPropertyIdsForModule(db, userId, "residents"),
  ]);
  const linkedPropertyIds = new Set<string>([...appIds, ...resIds]);
  const select = "id, row_data, updated_at, manager_user_id, property_id, assigned_property_id";

  const { data: ownedRows, error: ownedError } = await db
    .from("manager_application_records")
    .select(select)
    .eq("manager_user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(500);
  if (ownedError) throw ownedError;

  const byId = new Map<string, (typeof ownedRows)[number]>();
  for (const row of ownedRows ?? []) {
    if (row.id) byId.set(row.id, row);
  }

  if (linkedPropertyIds.size > 0) {
    const propertyIds = [...linkedPropertyIds];
    const [{ data: byProperty, error: propertyError }, { data: byAssigned, error: assignedError }] = await Promise.all([
      db
        .from("manager_application_records")
        .select(select)
        .in("property_id", propertyIds)
        .order("updated_at", { ascending: false })
        .limit(500),
      db
        .from("manager_application_records")
        .select(select)
        .in("assigned_property_id", propertyIds)
        .order("updated_at", { ascending: false })
        .limit(500),
    ]);
    if (propertyError) throw propertyError;
    if (assignedError) throw assignedError;
    for (const row of [...(byProperty ?? []), ...(byAssigned ?? [])]) {
      if (!row.id || byId.has(row.id)) continue;
      byId.set(row.id, row);
    }
  }

  return [...byId.values()].sort((a, b) => {
    const aTs = Date.parse(String(a.updated_at ?? ""));
    const bTs = Date.parse(String(b.updated_at ?? ""));
    return (Number.isFinite(bTs) ? bTs : 0) - (Number.isFinite(aTs) ? aTs : 0);
  });
}

type ApplicationRecordForDelete = {
  id: string;
  row_data: unknown;
  manager_user_id?: string | null;
  resident_email?: string | null;
  property_id?: string | null;
  assigned_property_id?: string | null;
};

async function assertCanDeleteApplicationRecords(
  db: ReturnType<typeof createSupabaseServiceRoleClient>,
  user: NonNullable<Awaited<ReturnType<typeof sessionUser>>>,
  records: ApplicationRecordForDelete[],
): Promise<string | null> {
  if (records.length === 0) return null;

  const admin = await isAdminUser(user.id);
  if (admin) return null;

  const { data: profile } = await db.from("profiles").select("email, role").eq("id", user.id).maybeSingle();
  const role = String(profile?.role ?? user.user_metadata?.role ?? "").toLowerCase();
  const email = (profile?.email ?? user.email ?? "").trim().toLowerCase();

  if (role === "resident") {
    for (const record of records) {
      const row = normalizeRow(record.row_data as DemoApplicantRow);
      const rowEmail = (row.email ?? record.resident_email ?? "").trim().toLowerCase();
      if (!email || rowEmail !== email) {
        return "You can only withdraw your own application.";
      }
      if (row.bucket !== "pending") {
        return "This application can no longer be withdrawn.";
      }
    }
    return null;
  }

  if (role === "manager" || role === "owner" || role === "pro") {
    for (const record of records) {
      const row = normalizeRow(record.row_data as DemoApplicantRow);
      const managerUserId = record.manager_user_id ?? row.managerUserId ?? null;
      if (managerUserId === user.id) continue;
      const propertyId = (record.property_id ?? row.propertyId ?? row.application?.propertyId ?? "").trim();
      const assignedPropertyId = (record.assigned_property_id ?? row.assignedPropertyId ?? "").trim();
      // Co-manager deletes require the granular "delete" level on Applications.
      const canDelete =
        (propertyId && (await managerHasCoManagerPermissionForProperty(db, user.id, propertyId, "applications", "delete"))) ||
        (assignedPropertyId &&
          (await managerHasCoManagerPermissionForProperty(db, user.id, assignedPropertyId, "applications", "delete")));
      if (canDelete) continue;
      return "You do not have permission to delete this application.";
    }
    return null;
  }

  return "Unauthorized.";
}

export async function GET() {
  try {
    const user = await sessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const db = createSupabaseServiceRoleClient();
    const admin = await isAdminUser(user.id);
    const { role, email } = await resolvePortalRole(db, user);

    let data: { id: string; row_data: unknown }[] | null = null;
    let error: { message: string } | null = null;

    if (!admin && role === "resident") {
      const result = await db
        .from("manager_application_records")
        .select("id, row_data, updated_at")
        .eq("resident_email", email)
        .order("updated_at", { ascending: false })
        .limit(500);
      data = result.data;
      error = result.error;
    } else if (!admin && (role === "manager" || role === "owner" || role === "pro")) {
      try {
        data = await fetchApplicationsForManagerUser(db, user.id);
        error = null;
      } catch (e) {
        error = { message: e instanceof Error ? e.message : "Failed to load applications." };
      }
    } else if (admin) {
      const result = await db
        .from("manager_application_records")
        .select("id, row_data, updated_at")
        .order("updated_at", { ascending: false })
        .limit(500);
      data = result.data;
      error = result.error;
    } else {
      return NextResponse.json({ error: "Unauthorized." }, { status: 403 });
    }

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const byId = new Map<string, DemoApplicantRow>();
    const rowsNeedingNormalization: Array<{ recordId: string; row: DemoApplicantRow }> = [];
    for (const record of data ?? []) {
      if (!record.row_data) continue;
      const row = normalizeRow(record.row_data as DemoApplicantRow);
      byId.set(row.id, { ...byId.get(row.id), ...row });
      if (record.id !== row.id || (record.row_data as DemoApplicantRow).id !== row.id) {
        rowsNeedingNormalization.push({ recordId: record.id, row });
      }
    }
    await Promise.allSettled(rowsNeedingNormalization.map(({ recordId, row }) => persistNormalizedRow(db, recordId, row)));

    const rows = [...byId.values()];

    // Provision approved residents that were never provisioned (e.g. restored via SQL migration).
    // One batch profiles query finds which are missing; parallel provisioning handles only those.
    // This runs synchronously so accounts exist by the time the client fetches portal statuses.
    const approved = rows.filter((r) => r.bucket === "approved" && r.email?.trim().includes("@"));
    if (approved.length > 0) {
      const emails = [...new Set(approved.map((r) => r.email!.trim().toLowerCase()))];
      const { data: existing } = await db.from("profiles").select("email").in("email", emails);
      const existingSet = new Set((existing ?? []).map((p) => (p.email ?? "").trim().toLowerCase()).filter(Boolean));
      const unprovisioned = approved.filter((r) => !existingSet.has(r.email!.trim().toLowerCase()));
      if (unprovisioned.length > 0) {
        await Promise.allSettled(unprovisioned.map((row) => provisionApprovedResidentAccount(db, row).catch(() => undefined)));
      }
    }

    return NextResponse.json({ rows });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load applications.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      action?: "upsert" | "delete" | "replace";
      id?: string;
      row?: DemoApplicantRow;
      rows?: DemoApplicantRow[];
    };
    const db = createSupabaseServiceRoleClient();
    const user = await sessionUser();

    if (body.action === "replace") {
      const rows = Array.isArray(body.rows) ? body.rows.map(normalizeRow) : [];
      if (!user && rows.some((row) => row.bucket === "approved")) {
        return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
      }
      if (user) {
        const writeGate = await assertManagerOrAdminWriteAccess(db, user);
        if (writeGate) return writeGate;
      }
      const replaceAdmin = user ? await isAdminUser(user.id) : false;
      for (const row of rows) {
        // Attribute each row to its correct owner and enforce edit access on
        // foreign (linked-owner) rows. Admins keep the client-supplied owner.
        if (user && !replaceAdmin) {
          const gate = await resolveApplicationWriteOwner(db, user.id, row);
          if (!gate.ok) continue;
          row.managerUserId = gate.owner ?? user.id;
        }
        await persistNormalizedRow(db, row.id, row);
        if (row.bucket === "pending" && row.application?.consentCredit) {
          void tryAutoOrderScreening(db, row);
        }
      }
      return NextResponse.json({ ok: true });
    }

    if (body.action === "delete") {
      if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
      const id = body.id?.trim();
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const ids = idVariants(id);
      const { data: records, error: loadError } = await db
        .from("manager_application_records")
        .select("id, row_data, manager_user_id, resident_email, property_id, assigned_property_id")
        .or(ids.map((value) => `id.eq.${value}`).join(","));
      if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 });

      const idsToDelete = new Set<string>();
      for (const record of records ?? []) {
        if (record.id) idsToDelete.add(record.id);
      }

      const { data: allRecords, error: allLoadError } = await db
        .from("manager_application_records")
        .select("id, row_data, manager_user_id, resident_email, property_id, assigned_property_id");
      if (allLoadError) return NextResponse.json({ error: allLoadError.message }, { status: 500 });

      for (const record of allRecords ?? []) {
        const row = record.row_data as Partial<DemoApplicantRow> | null;
        const rowId = typeof row?.id === "string" ? row.id : "";
        if (rowId && ids.includes(rowId.trim())) idsToDelete.add(record.id);
        if (rowId && ids.includes(normalizeApplicationAxisId(rowId))) idsToDelete.add(record.id);
      }

      if (idsToDelete.size > 0) {
        const { data: recordsToDelete, error: fetchError } = await db
          .from("manager_application_records")
          .select("id, row_data, manager_user_id, resident_email, property_id, assigned_property_id")
          .in("id", [...idsToDelete]);
        if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
        const authError = await assertCanDeleteApplicationRecords(db, user, recordsToDelete ?? []);
        if (authError) return NextResponse.json({ error: authError }, { status: 403 });

        const { error } = await db.from("manager_application_records").delete().in("id", [...idsToDelete]);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, deleted: idsToDelete.size });
    }

    if (!body.row?.id) return NextResponse.json({ error: "row required" }, { status: 400 });
    let row = normalizeRow(body.row);
    if (!user) {
      return NextResponse.json({ error: "Sign in to submit an application." }, { status: 401 });
    }
    const { role, email } = await resolvePortalRole(db, user);
    if (role === "resident") {
      const rowEmail = (row.email ?? "").trim().toLowerCase();
      if (!email || rowEmail !== email) {
        return NextResponse.json({ error: "You can only update your own application." }, { status: 403 });
      }
      const ids = idVariants(row.id);
      const { data: records, error: loadError } = await db
        .from("manager_application_records")
        .select("id, row_data")
        .or(ids.map((value) => `id.eq.${value}`).join(","))
        .limit(1);
      if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 });
      const existing = records?.[0]?.row_data as DemoApplicantRow | undefined;
      if (existing && existing.bucket !== "pending") {
        return NextResponse.json({ error: "This application can no longer be edited." }, { status: 403 });
      }
      if (row.bucket !== "pending") {
        return NextResponse.json({ error: "Residents cannot change application status." }, { status: 403 });
      }
      row = {
        ...row,
        bucket: "pending",
        assignedPropertyId: existing?.assignedPropertyId ?? row.assignedPropertyId,
        assignedRoomChoice: existing?.assignedRoomChoice ?? row.assignedRoomChoice,
        signedMonthlyRent: existing?.signedMonthlyRent ?? row.signedMonthlyRent,
        managerUserId: existing?.managerUserId ?? row.managerUserId,
        backgroundCheckStatus: existing?.backgroundCheckStatus ?? row.backgroundCheckStatus,
        screening: existing?.screening ?? row.screening,
        manuallyAdded: existing?.manuallyAdded ?? row.manuallyAdded,
        moveInInstructions: existing?.moveInInstructions ?? row.moveInInstructions,
        application:
          row.application && existing?.application
            ? {
                ...row.application,
                managerRentOverride: existing.application.managerRentOverride,
                managerUtilitiesOverride: existing.application.managerUtilitiesOverride,
                managerSecurityDepositOverride: existing.application.managerSecurityDepositOverride,
                managerMoveInFeeOverride: existing.application.managerMoveInFeeOverride,
                managerOtherCostLabel: existing.application.managerOtherCostLabel,
                managerOtherCostAmount: existing.application.managerOtherCostAmount,
              }
            : row.application,
      };
      row = await linkResidentOnApplicationSubmit(db, {
        userId: user.id,
        row,
        isNewSubmit: !existing,
      });
    } else {
      const writeGate = await assertManagerOrAdminWriteAccess(db, user);
      if (writeGate) return writeGate;
      if (!(await isAdminUser(user.id))) {
        const gate = await resolveApplicationWriteOwner(db, user.id, row);
        if (!gate.ok) {
          return NextResponse.json(
            { error: "You do not have edit access to this property's applications." },
            { status: 403 },
          );
        }
        row.managerUserId = gate.owner ?? user.id;
      }
    }
    await persistNormalizedRow(db, row.id, row);
    if (row.bucket === "pending" && row.application?.consentCredit) {
      void tryAutoOrderScreening(db, row);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to save application.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
