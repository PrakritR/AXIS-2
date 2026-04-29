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

function parseMoneyAmount(label: string | undefined | null): number {
  const n = Number.parseFloat(String(label ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function moneyLabel(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function dueLabelForLeaseStart(leaseStart?: string | null): string {
  const raw = leaseStart?.trim();
  if (!raw) return "Before move-in";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "Before move-in";
  return `Before ${date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
}

function leaseStartProration(leaseStart?: string | null): { prorated: boolean; factor: number } {
  if (!leaseStart?.trim()) return { prorated: false, factor: 1 };
  const [yearRaw, monthRaw, dayRaw] = leaseStart.split("-").map(Number);
  if (!yearRaw || !monthRaw || !dayRaw) return { prorated: false, factor: 1 };
  const daysInMonth = new Date(yearRaw, monthRaw, 0).getDate();
  if (!Number.isFinite(daysInMonth) || daysInMonth <= 0 || dayRaw <= 1) {
    return { prorated: false, factor: 1 };
  }
  const billableDays = Math.max(1, daysInMonth - dayRaw + 1);
  return { prorated: true, factor: billableDays / daysInMonth };
}

function nextProratedChargeId(currentId: string, nextKind: HouseholdCharge["kind"]): string {
  if (nextKind === "prorated_rent") {
    const replaced = currentId.replace(/_first_month_rent$/, "_prorated_rent");
    return replaced === currentId ? `${currentId}_prorated_rent` : replaced;
  }
  const replaced = currentId.replace(/_utilities$/, "_prorated_utilities");
  return replaced === currentId ? `${currentId}_prorated_utilities` : replaced;
}

async function reconcileLegacyProratedCharges(
  db: ReturnType<typeof createSupabaseServiceRoleClient>,
  charges: HouseholdCharge[],
): Promise<HouseholdCharge[]> {
  const candidates = charges.filter(
    (charge) =>
      charge.status === "pending" &&
      !!charge.applicationId &&
      (charge.kind === "first_month_rent" || charge.kind === "utilities"),
  );
  if (candidates.length === 0) return charges;

  const applicationIds = [...new Set(candidates.map((charge) => charge.applicationId!).filter(Boolean))];
  const { data: applicationRows } = await db
    .from("manager_application_records")
    .select("id, row_data")
    .in("id", applicationIds);

  const applicationById = new Map<string, Record<string, unknown>>();
  for (const row of applicationRows ?? []) {
    if (!row?.id || !row.row_data || typeof row.row_data !== "object" || Array.isArray(row.row_data)) continue;
    applicationById.set(String(row.id), row.row_data as Record<string, unknown>);
  }

  const replacements = new Map<string, HouseholdCharge>();
  const deletes = new Set<string>();

  for (const charge of candidates) {
    const application = applicationById.get(charge.applicationId!);
    const nestedApplication =
      application?.application && typeof application.application === "object" && !Array.isArray(application.application)
        ? (application.application as Record<string, unknown>)
        : null;
    const leaseStart = typeof nestedApplication?.leaseStart === "string" ? nestedApplication.leaseStart : "";
    const proration = leaseStartProration(leaseStart);
    if (!proration.prorated) continue;

    const baseAmount = parseMoneyAmount(charge.amountLabel);
    if (!(baseAmount > 0)) continue;

    const amount = Number((baseAmount * proration.factor).toFixed(2));
    const nextKind = charge.kind === "first_month_rent" ? "prorated_rent" : "prorated_utilities";
    const nextTitle = nextKind === "prorated_rent" ? "Prorated first month's rent" : "Prorated utilities";
    const nextId = nextProratedChargeId(charge.id, nextKind);
    const nextLabel = moneyLabel(amount);

    const nextCharge: HouseholdCharge = normalizeCharge({
      ...charge,
      id: nextId,
      kind: nextKind,
      title: nextTitle,
      amountLabel: nextLabel,
      balanceLabel: charge.status === "paid" ? "$0.00" : nextLabel,
      dueDateLabel: dueLabelForLeaseStart(leaseStart),
    });

    replacements.set(nextId, nextCharge);
    if (nextId !== charge.id) deletes.add(charge.id);
  }

  if (replacements.size === 0 && deletes.size === 0) return charges;

  for (const id of deletes) {
    await db.from("portal_household_charge_records").delete().eq("id", id);
  }
  for (const charge of replacements.values()) {
    await upsertCharge(db, charge);
  }

  const next = charges
    .filter((charge) => !deletes.has(charge.id) && !replacements.has(charge.id))
    .concat([...replacements.values()]);

  return next;
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

    let charges = (chargesData ?? []).map((record) => normalizeCharge(record.row_data as HouseholdCharge));
    const rentProfiles = (profilesData ?? []).map((record) => normalizeProfile(record.row_data as RecurringRentProfile));
    charges = await reconcileLegacyProratedCharges(db, charges);
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
