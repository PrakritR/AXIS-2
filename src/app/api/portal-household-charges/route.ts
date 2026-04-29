import { NextResponse } from "next/server";
import type { HouseholdCharge, RecurringRentProfile } from "@/lib/household-charges";
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

async function sessionScope() {
  const user = await sessionUser();
  if (!user) return null;
  const db = createSupabaseServiceRoleClient();
  const { data: profile } = await db.from("profiles").select("email, role").eq("id", user.id).maybeSingle();
  return {
    user,
    db,
    role: String(profile?.role ?? user.user_metadata?.role ?? "").toLowerCase(),
    email: (profile?.email ?? user.email ?? "").trim().toLowerCase(),
  };
}

function normalizeCharge(row: HouseholdCharge): HouseholdCharge {
  return {
    ...row,
    residentEmail: row.residentEmail?.trim().toLowerCase() || row.residentEmail,
    managerUserId: row.managerUserId ?? null,
    residentUserId: row.residentUserId ?? null,
  };
}

function normalizeProfile(row: RecurringRentProfile): RecurringRentProfile {
  return {
    ...row,
    residentEmail: row.residentEmail?.trim().toLowerCase() || row.residentEmail,
    managerUserId: row.managerUserId ?? null,
    residentUserId: row.residentUserId ?? null,
    active: row.active !== false,
  };
}

async function upsertCharge(db: ReturnType<typeof createSupabaseServiceRoleClient>, charge: HouseholdCharge) {
  const row = normalizeCharge(charge);
  await db.from("portal_household_charge_records").upsert(
    {
      id: row.id,
      manager_user_id: row.managerUserId || null,
      resident_user_id: row.residentUserId || null,
      resident_email: row.residentEmail || null,
      property_id: row.propertyId || null,
      kind: row.kind || null,
      status: row.status || null,
      row_data: row,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
}

async function upsertProfile(db: ReturnType<typeof createSupabaseServiceRoleClient>, profile: RecurringRentProfile) {
  const row = normalizeProfile(profile);
  await db.from("portal_recurring_rent_profile_records").upsert(
    {
      id: row.id,
      manager_user_id: row.managerUserId || null,
      resident_user_id: row.residentUserId || null,
      resident_email: row.residentEmail || null,
      property_id: row.propertyId || null,
      active: row.active,
      row_data: row,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
}

export async function GET() {
  try {
    const scope = await sessionScope();
    if (!scope) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const { user, db, role, email } = scope;

    let chargesQuery = db.from("portal_household_charge_records").select("row_data, updated_at").order("updated_at", { ascending: false });
    let profilesQuery = db.from("portal_recurring_rent_profile_records").select("row_data, updated_at").order("updated_at", { ascending: false });

    if (role === "resident") {
      chargesQuery = chargesQuery.or(`resident_user_id.eq.${user.id},resident_email.eq.${email}`);
      profilesQuery = profilesQuery.or(`resident_user_id.eq.${user.id},resident_email.eq.${email}`);
    } else if (role !== "admin") {
      chargesQuery = chargesQuery.eq("manager_user_id", user.id);
      profilesQuery = profilesQuery.eq("manager_user_id", user.id);
    }

    const [{ data: chargesData, error: chargesError }, { data: profilesData, error: profilesError }] = await Promise.all([
      chargesQuery,
      profilesQuery,
    ]);
    if (chargesError) return NextResponse.json({ error: chargesError.message }, { status: 500 });
    if (profilesError) return NextResponse.json({ error: profilesError.message }, { status: 500 });

    const charges = (chargesData ?? []).map((record) => normalizeCharge(record.row_data as HouseholdCharge));
    const rentProfiles = (profilesData ?? []).map((record) => normalizeProfile(record.row_data as RecurringRentProfile));
    return NextResponse.json({ charges, rentProfiles });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load charges.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      action?: "replace" | "upsertCharge" | "upsertProfile" | "deleteCharge" | "deleteProfile";
      charges?: HouseholdCharge[];
      rentProfiles?: RecurringRentProfile[];
      charge?: HouseholdCharge;
      rentProfile?: RecurringRentProfile;
      id?: string;
    };
    const scope = await sessionScope();
    if (!scope) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const { user, db, role, email } = scope;

    if (body.action === "deleteCharge") {
      const id = body.id?.trim();
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const { error } = await db.from("portal_household_charge_records").delete().eq("id", id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    if (body.action === "deleteProfile") {
      const id = body.id?.trim();
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const { error } = await db.from("portal_recurring_rent_profile_records").delete().eq("id", id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    if (body.action === "upsertCharge") {
      if (!body.charge?.id) return NextResponse.json({ error: "charge required" }, { status: 400 });
      await upsertCharge(db, body.charge);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "upsertProfile") {
      if (!body.rentProfile?.id) return NextResponse.json({ error: "rentProfile required" }, { status: 400 });
      await upsertProfile(db, body.rentProfile);
      return NextResponse.json({ ok: true });
    }

    const charges = Array.isArray(body.charges) ? body.charges : [];
    const rentProfiles = Array.isArray(body.rentProfiles) ? body.rentProfiles : [];
    await Promise.all([
      ...charges.map((charge) => upsertCharge(db, charge)),
      ...rentProfiles.map((profile) => upsertProfile(db, profile)),
    ]);
    if (role === "admin") {
      return NextResponse.json({ ok: true });
    }
    const chargeIds = charges.map((charge) => charge.id).filter(Boolean);
    const profileIds = rentProfiles.map((profile) => profile.id).filter(Boolean);

    let chargeDeleteQuery = db.from("portal_household_charge_records").delete();
    let profileDeleteQuery = db.from("portal_recurring_rent_profile_records").delete();
    if (role === "resident") {
      chargeDeleteQuery = chargeDeleteQuery.or(`resident_user_id.eq.${user.id},resident_email.eq.${email}`);
      profileDeleteQuery = profileDeleteQuery.or(`resident_user_id.eq.${user.id},resident_email.eq.${email}`);
    } else if (role !== "admin") {
      chargeDeleteQuery = chargeDeleteQuery.eq("manager_user_id", user.id);
      profileDeleteQuery = profileDeleteQuery.eq("manager_user_id", user.id);
    }
    if (chargeIds.length > 0) {
      chargeDeleteQuery = chargeDeleteQuery.not("id", "in", `(${chargeIds.map((id) => JSON.stringify(id)).join(",")})`);
    }
    if (profileIds.length > 0) {
      profileDeleteQuery = profileDeleteQuery.not("id", "in", `(${profileIds.map((id) => JSON.stringify(id)).join(",")})`);
    }
    const [{ error: chargeDeleteError }, { error: profileDeleteError }] = await Promise.all([
      chargeDeleteQuery,
      profileDeleteQuery,
    ]);
    if (chargeDeleteError) return NextResponse.json({ error: chargeDeleteError.message }, { status: 500 });
    if (profileDeleteError) return NextResponse.json({ error: profileDeleteError.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to save charges.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
