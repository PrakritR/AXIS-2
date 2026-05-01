import { NextResponse } from "next/server";
import { isAdminUser } from "@/lib/auth/admin-preview";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

function toUuid(id: unknown): string | null {
  if (!id || typeof id !== "string") return null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return id;
  return null;
}

async function getUserContext() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createSupabaseServiceRoleClient();
  const [profileResult, rolesResult] = await Promise.all([
    db.from("profiles").select("email, role").eq("id", user.id).maybeSingle(),
    db.from("profile_roles").select("role").eq("user_id", user.id),
  ]);
  const profile = profileResult.data;
  const admin = await isAdminUser(user.id);
  const roleRows = (rolesResult.data ?? []).map((r) => String(r.role).toLowerCase());
  const legacyRole = String(profile?.role ?? user.user_metadata?.role ?? "").toLowerCase();
  const allRoles = roleRows.length > 0 ? roleRows : (legacyRole ? [legacyRole] : []);
  const isManagerOrOwner = allRoles.some((r) => r === "manager" || r === "owner");
  const resolvedRole = admin ? "admin" : isManagerOrOwner ? "manager" : "resident";
  return {
    db,
    user: {
      id: user.id,
      email: (profile?.email ?? user.email ?? "").trim().toLowerCase(),
      role: resolvedRole,
    },
  };
}

export async function GET() {
  try {
    const ctx = await getUserContext();
    if (!ctx) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const { db, user } = ctx;

    let chargeQuery = db
      .from("portal_household_charge_records")
      .select("id, row_data, updated_at")
      .order("updated_at", { ascending: false });
    let profileQuery = db
      .from("portal_recurring_rent_profile_records")
      .select("id, row_data, updated_at")
      .order("updated_at", { ascending: false });

    if (user.role === "admin") {
      // admin sees all
    } else if (user.role === "manager") {
      // Managers see charges they own; also include any where they appear as a resident (edge case)
      chargeQuery = chargeQuery.or(`manager_user_id.eq.${user.id},resident_user_id.eq.${user.id},resident_email.eq.${user.email}`);
      profileQuery = profileQuery.or(`manager_user_id.eq.${user.id},resident_user_id.eq.${user.id},resident_email.eq.${user.email}`);
    } else {
      // Resident — match by user_id or email
      chargeQuery = chargeQuery.or(`resident_user_id.eq.${user.id},resident_email.eq.${user.email}`);
      profileQuery = profileQuery.or(`resident_user_id.eq.${user.id},resident_email.eq.${user.email}`);
    }

    const [chargeResult, profileResult] = await Promise.all([chargeQuery, profileQuery]);
    if (chargeResult.error) return NextResponse.json({ error: chargeResult.error.message }, { status: 500 });
    if (profileResult.error) return NextResponse.json({ error: profileResult.error.message }, { status: 500 });

    const charges = (chargeResult.data ?? []).map((r) => r.row_data);
    const rentProfiles = (profileResult.data ?? []).map((r) => r.row_data);
    return NextResponse.json({ charges, rentProfiles });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load charges.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await getUserContext();
    if (!ctx) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const { db, user } = ctx;

    if (user.role === "resident") {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const body = (await req.json()) as {
      action?: string;
      id?: string;
      charges?: Record<string, unknown>[];
      rentProfiles?: Record<string, unknown>[];
    };
    const now = new Date().toISOString();

    if (body.action === "deleteCharge") {
      const id = body.id?.trim();
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      await db.from("portal_household_charge_records").delete().eq("id", id);
      return NextResponse.json({ ok: true });
    }

    const charges = Array.isArray(body.charges) ? body.charges : [];
    const rentProfiles = Array.isArray(body.rentProfiles) ? body.rentProfiles : [];

    if (charges.length > 0) {
      const rows = charges
        .filter((c) => c.id)
        .map((c) => ({
          id: String(c.id),
          manager_user_id: toUuid(c.managerUserId) ?? user.id,
          resident_user_id: toUuid(c.residentUserId),
          resident_email: typeof c.residentEmail === "string" ? c.residentEmail.trim().toLowerCase() : null,
          property_id: typeof c.propertyId === "string" ? c.propertyId : null,
          kind: typeof c.kind === "string" ? c.kind : null,
          status: typeof c.status === "string" ? c.status : null,
          row_data: c,
          updated_at: now,
        }));
      if (rows.length > 0) {
        const { error } = await db.from("portal_household_charge_records").upsert(rows, { onConflict: "id" });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    if (rentProfiles.length > 0) {
      const rows = rentProfiles
        .filter((p) => p.id)
        .map((p) => ({
          id: String(p.id),
          manager_user_id: toUuid(p.managerUserId) ?? user.id,
          resident_user_id: toUuid(p.residentUserId),
          resident_email: typeof p.residentEmail === "string" ? p.residentEmail.trim().toLowerCase() : null,
          property_id: typeof p.propertyId === "string" ? p.propertyId : null,
          active: p.active !== false,
          row_data: p,
          updated_at: now,
        }));
      if (rows.length > 0) {
        const { error } = await db.from("portal_recurring_rent_profile_records").upsert(rows, { onConflict: "id" });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to save charges.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
