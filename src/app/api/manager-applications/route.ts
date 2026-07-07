import { NextResponse } from "next/server";
import type { DemoApplicantRow } from "@/data/demo-portal";
import { linkResidentOnApplicationSubmit } from "@/lib/auth/link-resident-on-application-submit";
import { isAdminUser } from "@/lib/auth/admin-preview";
import { collectLinkedPropertyIdsForUser } from "@/lib/auth/manager-lease-scope";
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

async function fetchApplicationsForManagerUser(
  db: ReturnType<typeof createSupabaseServiceRoleClient>,
  userId: string,
) {
  const linkedPropertyIds = await collectLinkedPropertyIdsForUser(db, userId);
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

export async function GET() {
  try {
    const user = await sessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const db = createSupabaseServiceRoleClient();
    const admin = await isAdminUser(user.id);
    const { data: profile } = await db.from("profiles").select("email, role").eq("id", user.id).maybeSingle();
    const role = String(profile?.role ?? user.user_metadata?.role ?? "").toLowerCase();
    const email = (profile?.email ?? user.email ?? "").trim().toLowerCase();

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
    } else {
      const result = await db
        .from("manager_application_records")
        .select("id, row_data, updated_at")
        .order("updated_at", { ascending: false })
        .limit(500);
      data = result.data;
      error = result.error;
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
      for (const row of rows) {
        await persistNormalizedRow(db, row.id, row);
        if (row.bucket === "pending" && row.application?.consentCredit) {
          void tryAutoOrderScreening(db, row);
        }
      }
      return NextResponse.json({ ok: true });
    }

    if (body.action === "delete") {
      const id = body.id?.trim();
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const ids = idVariants(id);
      const { data: records, error: loadError } = await db
        .from("manager_application_records")
        .select("id, row_data")
        .or(ids.map((value) => `id.eq.${value}`).join(","));
      if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 });

      const idsToDelete = new Set<string>();
      for (const record of records ?? []) {
        if (record.id) idsToDelete.add(record.id);
      }

      const { data: allRecords, error: allLoadError } = await db
        .from("manager_application_records")
        .select("id, row_data");
      if (allLoadError) return NextResponse.json({ error: allLoadError.message }, { status: 500 });

      for (const record of allRecords ?? []) {
        const row = record.row_data as Partial<DemoApplicantRow> | null;
        const rowId = typeof row?.id === "string" ? row.id : "";
        if (rowId && ids.includes(rowId.trim())) idsToDelete.add(record.id);
        if (rowId && ids.includes(normalizeApplicationAxisId(rowId))) idsToDelete.add(record.id);
      }

      if (idsToDelete.size > 0) {
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
    const { data: profile } = await db.from("profiles").select("email, role").eq("id", user.id).maybeSingle();
    const role = String(profile?.role ?? user.user_metadata?.role ?? "").toLowerCase();
    if (role === "resident") {
      const email = (profile?.email ?? user.email ?? "").trim().toLowerCase();
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
