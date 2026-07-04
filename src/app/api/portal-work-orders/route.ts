import { NextResponse } from "next/server";
import type { DemoManagerWorkOrderRow } from "@/data/demo-portal";
import { isAdminUser } from "@/lib/auth/admin-preview";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { residentBelongsToManager } from "@/lib/resident-manager-scope";

export const runtime = "nodejs";

async function sessionUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
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

    let query = db
      .from("portal_work_order_records")
      .select("row_data, updated_at")
      .order("updated_at", { ascending: false })
      .limit(500);

    if (!admin && role === "resident") {
      query = query.eq("resident_email", email);
    } else if (!admin && role === "vendor") {
      // A vendor sees only work orders assigned to them, never another vendor's or landlord's.
      query = query.eq("vendor_user_id", user.id);
    } else if (!admin) {
      // Managers see only their own work orders (plus legacy unassigned rows),
      // never other landlords'. This matches the manager panel's client filter.
      query = query.or(`manager_user_id.eq.${user.id},manager_user_id.is.null`);
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
 * for the vendor's own GET query and inbox notifications without a join at read time. */
async function resolveVendorUserId(
  db: ReturnType<typeof createSupabaseServiceRoleClient>,
  vendorId: string | null | undefined,
): Promise<string | null> {
  const id = vendorId?.trim();
  if (!id) return null;
  const { data } = await db.from("manager_vendor_records").select("vendor_user_id").eq("id", id).maybeSingle();
  return (data?.vendor_user_id as string | null) ?? null;
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
        const vendorUserId = await resolveVendorUserId(db, row.vendorId);
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
    const vendorUserId = await resolveVendorUserId(db, body.row.vendorId);
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
