import { NextResponse } from "next/server";
import type { DemoManagerWorkOrderRow } from "@/data/demo-portal";
import { isAdminUser } from "@/lib/auth/admin-preview";
import { fetchRowsForManagerWithLinked, linkedPropertyIdsForModule } from "@/lib/auth/co-manager-module-scope";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { residentBelongsToManager } from "@/lib/resident-manager-scope";

export const runtime = "nodejs";

type Db = ReturnType<typeof createSupabaseServiceRoleClient>;

type WorkOrderScopeRecord = { id: string; row_data: DemoManagerWorkOrderRow | null; updated_at: string | null };

async function sessionUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** A vendor sees work orders they're currently assigned to (vendor_user_id) plus any
 * they were sent a consultation/quote offer for (work_order_vendor_offers) — several
 * vendors can be offered the same not-yet-assigned work order at once, so this can't
 * rely on the single vendor_user_id column alone. */
async function vendorScopedWorkOrderRows(db: Db, vendorUserId: string): Promise<DemoManagerWorkOrderRow[]> {
  const { data: vendorDirectoryRows } = await db.from("manager_vendor_records").select("id").eq("vendor_user_id", vendorUserId);
  const vendorDirectoryIds = (vendorDirectoryRows ?? []).map((row) => String(row.id ?? "")).filter(Boolean);

  const offeredIds = new Set<string>();
  const { data: offersByUser } = await db
    .from("work_order_vendor_offers")
    .select("work_order_id")
    .eq("vendor_user_id", vendorUserId)
    .eq("status", "sent");
  for (const offer of offersByUser ?? []) offeredIds.add(offer.work_order_id as string);

  if (vendorDirectoryIds.length > 0) {
    const { data: offersByDirectory } = await db
      .from("work_order_vendor_offers")
      .select("work_order_id")
      .in("vendor_directory_id", vendorDirectoryIds)
      .eq("status", "sent");
    for (const offer of offersByDirectory ?? []) offeredIds.add(offer.work_order_id as string);
  }

  const { data: assigned } = await db
    .from("portal_work_order_records")
    .select("id, row_data, updated_at")
    .eq("vendor_user_id", vendorUserId)
    .order("updated_at", { ascending: false })
    .limit(500);

  const byId = new Map<string, DemoManagerWorkOrderRow>();
  for (const record of assigned ?? []) {
    const row = record.row_data as DemoManagerWorkOrderRow | null;
    if (row) byId.set(record.id as string, row);
  }

  const missingIds = [...offeredIds].filter((id) => !byId.has(id));
  if (missingIds.length > 0) {
    const { data: offeredRows } = await db.from("portal_work_order_records").select("id, row_data").in("id", missingIds);
    for (const record of offeredRows ?? []) {
      const row = record.row_data as DemoManagerWorkOrderRow | null;
      if (row) byId.set(record.id as string, row);
    }
  }

  return [...byId.values()];
}

function normalizeRow(row: DemoManagerWorkOrderRow): DemoManagerWorkOrderRow {
  return {
    ...row,
    residentEmail: row.residentEmail?.trim().toLowerCase() || row.residentEmail,
  };
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

    if (!admin && role === "vendor") {
      const rows = await vendorScopedWorkOrderRows(db, user.id);
      return NextResponse.json({ rows });
    }

    if (!admin && role !== "resident") {
      // Managers see their own work orders (plus legacy unassigned rows), never
      // other landlords' — and additionally rows on properties shared with them
      // via an accepted co-manager link with services access.
      const linkedPropertyIds = await linkedPropertyIdsForModule(db, user.id, "services");
      const records = await fetchRowsForManagerWithLinked<WorkOrderScopeRecord>(
        db,
        "portal_work_order_records",
        user.id,
        linkedPropertyIds,
        { propertyColumns: ["property_id", "assigned_property_id"] },
      );
      const byId = new Map<string, WorkOrderScopeRecord>();
      for (const record of records) {
        if (record.id) byId.set(record.id, record);
      }
      // Legacy unassigned rows stay visible to managers (previously included via
      // `manager_user_id.is.null` in the .or filter).
      const { data: legacyRows, error: legacyError } = await db
        .from("portal_work_order_records")
        .select("id, row_data, updated_at")
        .is("manager_user_id", null)
        .order("updated_at", { ascending: false })
        .limit(500);
      if (legacyError) return NextResponse.json({ error: legacyError.message }, { status: 500 });
      for (const record of (legacyRows ?? []) as unknown as WorkOrderScopeRecord[]) {
        if (record.id && !byId.has(record.id)) byId.set(record.id, record);
      }
      const rows = [...byId.values()]
        .sort((a, b) => {
          const aTs = Date.parse(String(a.updated_at ?? ""));
          const bTs = Date.parse(String(b.updated_at ?? ""));
          return (Number.isFinite(bTs) ? bTs : 0) - (Number.isFinite(aTs) ? aTs : 0);
        })
        .map((record) => record.row_data)
        .filter(Boolean) as DemoManagerWorkOrderRow[];
      return NextResponse.json({ rows });
    }

    let query = db
      .from("portal_work_order_records")
      .select("row_data, updated_at")
      .order("updated_at", { ascending: false })
      .limit(500);

    if (!admin && role === "resident") {
      query = query.eq("resident_email", email);
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rows = (data ?? [])
      .map((record) => record.row_data)
      .filter(Boolean) as DemoManagerWorkOrderRow[];
    return NextResponse.json({ rows });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load work orders.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

type Actor = { userId: string; email: string; admin: boolean; role: string };

type OwnerCols = { manager_user_id?: string | null; resident_email?: string | null };

/** Whether the caller may write/delete a row. Managers own their own rows and
 * may also claim legacy rows with no owner; residents own rows addressed to
 * them; admins may act on any row. */
function actorOwnsRecord(actor: Actor, rec: OwnerCols | null): boolean {
  if (actor.admin) return true;
  if (!rec) return false;
  if (rec.manager_user_id && rec.manager_user_id === actor.userId) return true;
  if (rec.resident_email && actor.email && rec.resident_email.trim().toLowerCase() === actor.email) return true;
  // Legacy unassigned rows are claimable by a manager (never a resident).
  if (!rec.manager_user_id && actor.role !== "resident") return true;
  return false;
}

/** Resolve a vendor directory row's linked auth user, so the record can be scoped
 * for the vendor's own GET query and inbox notifications without a join at read time.
 * Rejects (returns `rejected: true`) a vendorId that doesn't belong to `ownerManagerUserId`
 * and isn't marked shared — the same ownership gate the sibling work-order-vendor-offers
 * route applies — so a client can't attach an uninvited/other-manager's vendor to a work
 * order via a crafted vendorId. */
async function resolveVendorUserId(
  db: ReturnType<typeof createSupabaseServiceRoleClient>,
  vendorId: string | null | undefined,
  ownerManagerUserId: string | null,
): Promise<{ vendorUserId: string | null; rejected: boolean }> {
  const id = vendorId?.trim();
  if (!id) return { vendorUserId: null, rejected: false };
  const { data } = await db
    .from("manager_vendor_records")
    .select("manager_user_id, vendor_user_id, row_data")
    .eq("id", id)
    .maybeSingle();
  if (!data) return { vendorUserId: null, rejected: true };
  const rowData = (data.row_data ?? {}) as Record<string, unknown>;
  const shared = rowData.sharedWithManagers === true;
  const owned = Boolean(ownerManagerUserId) && (data.manager_user_id === ownerManagerUserId || shared);
  if (!owned) return { vendorUserId: null, rejected: true };
  return { vendorUserId: (data.vendor_user_id as string | null) ?? null, rejected: false };
}

/** Which manager's vendor directory a vendorId must belong to (or be shared with) for
 * this write. A manager actor always uses their own id, never client input. A resident's
 * `row.managerUserId` has already been verified as legitimate by residentMayTargetRowManager.
 * An admin trusts the row's managerUserId, falling back to a DB lookup when editing an
 * existing row whose body omitted it. */
async function resolveVendorOwnerManagerUserId(
  db: ReturnType<typeof createSupabaseServiceRoleClient>,
  actor: Actor,
  row: DemoManagerWorkOrderRow,
): Promise<string | null> {
  if (actor.role === "resident") return row.managerUserId?.trim() || null;
  if (!actor.admin) return actor.userId;
  const fromRow = row.managerUserId?.trim();
  if (fromRow) return fromRow;
  const { data } = await db
    .from("portal_work_order_records")
    .select("manager_user_id")
    .eq("id", row.id)
    .maybeSingle();
  return (data?.manager_user_id as string | null) ?? null;
}

/** Build the persisted record, binding scope columns to the authenticated caller
 * so a client cannot spoof ownership. */
function recordForActor(actor: Actor, row: DemoManagerWorkOrderRow, vendorUserId: string | null) {
  const normalized = normalizeRow(row);
  const base = {
    id: normalized.id,
    manager_user_id: normalized.managerUserId || null,
    resident_email: normalized.residentEmail?.trim().toLowerCase() || null,
    property_id: normalized.propertyId || null,
    assigned_property_id: normalized.assignedPropertyId || null,
    vendor_user_id: normalized.selfAssigned ? null : vendorUserId,
    row_data: normalized,
    updated_at: new Date().toISOString(),
  };
  if (actor.admin) return base;
  if (actor.role === "resident") {
    return { ...base, resident_email: actor.email || base.resident_email };
  }
  // Any other non-admin caller is the owning manager; never trust a
  // client-supplied manager_user_id.
  return { ...base, manager_user_id: actor.userId };
}

export async function POST(req: Request) {
  try {
    const user = await sessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const db = createSupabaseServiceRoleClient();
    const admin = await isAdminUser(user.id);
    const { data: profile } = await db.from("profiles").select("email, role").eq("id", user.id).maybeSingle();
    const actor: Actor = {
      userId: user.id,
      email: (profile?.email ?? user.email ?? "").trim().toLowerCase(),
      admin,
      role: String(profile?.role ?? user.user_metadata?.role ?? "").toLowerCase(),
    };

    // Vendors see their offered/assigned work through GET; the record itself is
    // manager-authored (assignment, scheduling, billing), so vendor writes are rejected.
    if (!admin && actor.role === "vendor") {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const body = (await req.json()) as {
      action?: "upsert" | "delete" | "replace";
      id?: string;
      row?: DemoManagerWorkOrderRow;
      rows?: DemoManagerWorkOrderRow[];
    };

    const ownsExisting = async (id: string): Promise<boolean> => {
      const { data } = await db
        .from("portal_work_order_records")
        .select("manager_user_id, resident_email")
        .eq("id", id)
        .maybeSingle();
      // A brand-new id (no existing row) may be created.
      return data == null || actorOwnsRecord(actor, data);
    };

    // A resident may only file against a manager that actually has them as a
    // resident; never trust a client-supplied manager_user_id to route a row
    // into an arbitrary manager's queue.
    const residentMayTargetRowManager = async (row: DemoManagerWorkOrderRow): Promise<boolean> => {
      if (actor.admin || actor.role !== "resident") return true;
      const claimedManager = row?.managerUserId?.trim() || "";
      if (!claimedManager) return false;
      return residentBelongsToManager(db, { residentEmail: actor.email, managerUserId: claimedManager });
    };

    if (body.action === "replace") {
      const rows = Array.isArray(body.rows) ? body.rows : [];
      for (const row of rows) {
        if (!row?.id) continue;
        if (!(await ownsExisting(row.id))) continue;
        if (!(await residentMayTargetRowManager(row))) continue;
        const { vendorUserId, rejected } = await resolveVendorUserId(
          db,
          row.vendorId,
          await resolveVendorOwnerManagerUserId(db, actor, row),
        );
        if (rejected) continue;
        await db.from("portal_work_order_records").upsert(recordForActor(actor, row, vendorUserId), { onConflict: "id" });
      }
      return NextResponse.json({ ok: true });
    }

    if (body.action === "delete") {
      const id = body.id?.trim();
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const { data: existing } = await db
        .from("portal_work_order_records")
        .select("manager_user_id, resident_email")
        .eq("id", id)
        .maybeSingle();
      if (!existing) return NextResponse.json({ ok: true });
      if (!actorOwnsRecord(actor, existing)) {
        return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      }
      const { error } = await db.from("portal_work_order_records").delete().eq("id", id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    if (!body.row?.id) return NextResponse.json({ error: "row required" }, { status: 400 });
    if (!(await ownsExisting(body.row.id))) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
    if (!(await residentMayTargetRowManager(body.row))) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
    const { vendorUserId, rejected } = await resolveVendorUserId(
      db,
      body.row.vendorId,
      await resolveVendorOwnerManagerUserId(db, actor, body.row),
    );
    if (rejected) return NextResponse.json({ error: "Forbidden: vendor not available to this manager." }, { status: 403 });
    const { error } = await db
      .from("portal_work_order_records")
      .upsert(recordForActor(actor, body.row, vendorUserId), { onConflict: "id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to save work order.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
