import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { ensureManagerSmsNumber } from "@/lib/twilio-provisioning";

export const runtime = "nodejs";

/** Manager-tier roles allowed to provision an Axis work number. */
function canProvisionWorkNumber(role: string | null | undefined): boolean {
  return role === "admin" || role === "manager" || role === "pro";
}

/**
 * POST — provision (or reuse) the signed-in manager's Axis SMS work number.
 * Idempotent: returns the existing number when one is already provisioned.
 * An optional 3-digit `areaCode` biases the search; otherwise Twilio picks.
 */
export async function POST(req: Request) {
  const auth = await createSupabaseServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  if (!process.env.TWILIO_ACCOUNT_SID?.trim() || !process.env.TWILIO_AUTH_TOKEN?.trim()) {
    return NextResponse.json({ error: "SMS is not configured yet — add Twilio credentials." }, { status: 503 });
  }

  const db = createSupabaseServiceRoleClient();

  const { data: profile, error: profileError } = await db
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError || !profile) {
    return NextResponse.json({ error: profileError?.message ?? "Profile not found." }, { status: 403 });
  }
  if (!canProvisionWorkNumber(profile.role)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { areaCode?: unknown };
  const areaCode = typeof body.areaCode === "string" ? body.areaCode : undefined;

  const result = await ensureManagerSmsNumber(db, user.id, { areaCode });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json({ number: result.number });
}
