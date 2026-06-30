import { NextResponse } from "next/server";
import type { ServiceRequest } from "@/lib/service-requests-storage";
import { isAdminUser } from "@/lib/auth/admin-preview";
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

function recordFromRow(row: ServiceRequest) {
  return {
    id: row.id,
    manager_user_id: row.managerUserId || null,
    resident_email: row.residentEmail?.trim().toLowerCase() || null,
    property_id: row.propertyId || null,
    status: row.status || null,
    row_data: { ...row, residentEmail: row.residentEmail?.trim().toLowerCase() || row.residentEmail },
    updated_at: new Date().toISOString(),
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
      .from("portal_service_request_records")
      .select("row_data, updated_at")
      .order("updated_at", { ascending: false })
      .limit(500);

    // Residents see only their own requests; managers/pro see the ones they own.
    if (!admin && role === "resident") {
      query = query.eq("resident_email", email);
    } else if (!admin) {
      query = query.eq("manager_user_id", user.id);
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rows = (data ?? []).map((record) => record.row_data).filter(Boolean) as ServiceRequest[];
    return NextResponse.json({ rows });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load service requests.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

type Actor = { userId: string; email: string; admin: boolean };

/** A caller may write/delete a row only if they own it: the manager it belongs
 * to, or the resident it is for. Admins may act on any row. */
function actorOwnsRecord(
  actor: Actor,
  rec: { manager_user_id?: string | null; resident_email?: string | null } | null,
): boolean {
  if (actor.admin) return true;
  if (!rec) return false;
  if (rec.manager_user_id && rec.manager_user_id === actor.userId) return true;
  if (rec.resident_email && actor.email && rec.resident_email.trim().toLowerCase() === actor.email) return true;
  return false;
}

/**
 * Bind the scope columns to the authenticated caller so a client cannot spoof
 * ownership: a manager's writes are pinned to their own id; a resident's writes
 * are pinned to their own email. The opposite-party field is taken from the row
 * (e.g. which manager a resident's request targets).
 */
function recordForActor(actor: Actor, role: string, row: ServiceRequest) {
  const base = recordFromRow(row);
  if (actor.admin) return base; // admins may act on behalf of any account
  if (role === "resident") {
    // The resident only owns the resident side; which manager they target stays
    // from the row (their property's owner).
    return { ...base, resident_email: actor.email || base.resident_email };
  }
  // Any other non-admin caller is treated as the owning manager — never trust a
  // client-supplied manager_user_id for a non-resident.
  return { ...base, manager_user_id: actor.userId };
}

export async function POST(req: Request) {
  try {
    const user = await sessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const db = createSupabaseServiceRoleClient();
    const admin = await isAdminUser(user.id);
    const { data: profile } = await db.from("profiles").select("email, role").eq("id", user.id).maybeSingle();
    const role = String(profile?.role ?? user.user_metadata?.role ?? "").toLowerCase();
    const actor: Actor = {
      userId: user.id,
      email: (profile?.email ?? user.email ?? "").trim().toLowerCase(),
      admin,
    };

    const body = (await req.json()) as {
      action?: "upsert" | "delete" | "replace";
      id?: string;
      row?: ServiceRequest;
      rows?: ServiceRequest[];
    };

    const ownsExisting = async (id: string): Promise<boolean> => {
      const { data } = await db
        .from("portal_service_request_records")
        .select("manager_user_id, resident_email")
        .eq("id", id)
        .maybeSingle();
      // A brand-new id (no existing row) is allowed to be created.
      return data == null || actorOwnsRecord(actor, data);
    };

    if (body.action === "replace") {
      const rows = Array.isArray(body.rows) ? body.rows : [];
      for (const row of rows) {
        if (!row?.id) continue;
        if (!(await ownsExisting(row.id))) continue;
        await db.from("portal_service_request_records").upsert(recordForActor(actor, role, row), { onConflict: "id" });
      }
      return NextResponse.json({ ok: true });
    }

    if (body.action === "delete") {
      const id = body.id?.trim();
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const { data: existing } = await db
        .from("portal_service_request_records")
        .select("manager_user_id, resident_email")
        .eq("id", id)
        .maybeSingle();
      if (!existing) return NextResponse.json({ ok: true });
      if (!actorOwnsRecord(actor, existing)) {
        return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      }
      const { error } = await db.from("portal_service_request_records").delete().eq("id", id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    if (!body.row?.id) return NextResponse.json({ error: "row required" }, { status: 400 });
    if (!(await ownsExisting(body.row.id))) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
    const { error } = await db
      .from("portal_service_request_records")
      .upsert(recordForActor(actor, role, body.row), { onConflict: "id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to save service request.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
