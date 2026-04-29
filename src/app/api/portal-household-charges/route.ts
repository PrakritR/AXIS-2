import { NextResponse } from "next/server";
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

async function clearPaymentTables() {
  const db = createSupabaseServiceRoleClient();
  await Promise.all([
    db.from("portal_household_charge_records").delete().not("id", "is", null),
    db.from("portal_recurring_rent_profile_records").delete().not("id", "is", null),
  ]);
}

export async function GET() {
  try {
    const user = await sessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    await clearPaymentTables();
    return NextResponse.json({ charges: [], rentProfiles: [], paymentsDisabled: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load charges.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST() {
  try {
    const user = await sessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    await clearPaymentTables();
    return NextResponse.json({ ok: true, paymentsDisabled: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to save charges.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
