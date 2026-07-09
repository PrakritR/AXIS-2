import { createHash, randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { sendSms } from "@/lib/twilio";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_SENDS_PER_WINDOW = 5;
const SEND_WINDOW_MS = 60 * 60 * 1000;
const RESEND_THROTTLE_MS = 60 * 1000;

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function normalizeUsPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

async function requireUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** GET — current phone settings for the signed-in user. */
export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const db = createSupabaseServiceRoleClient();
  const { data } = await db
    .from("profiles")
    .select("phone, phone_verified_at, sms_forward_inbound, sms_from_number")
    .eq("id", user.id)
    .maybeSingle();
  return NextResponse.json({
    phone: data?.phone ?? null,
    phoneVerifiedAt: data?.phone_verified_at ?? null,
    forwardInbound: data?.sms_forward_inbound !== false,
    workNumber: data?.sms_from_number ?? null,
    smsConfigured: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
  });
}

/** POST — start verification: send a 6-digit code to the given phone. */
export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { phone?: string };
  const phone = normalizeUsPhone(String(body.phone ?? ""));
  if (!phone) return NextResponse.json({ error: "Enter a valid US phone number." }, { status: 400 });

  const db = createSupabaseServiceRoleClient();

  const { data: existing } = await db
    .from("phone_verifications")
    .select("created_at, send_count, first_sent_at, phone")
    .eq("user_id", user.id)
    .maybeSingle();

  // Per-user resend throttle (>=60s between sends).
  if (existing && Date.now() - Date.parse(String(existing.created_at)) < RESEND_THROTTLE_MS) {
    return NextResponse.json({ error: "Code already sent — wait a minute before retrying." }, { status: 429 });
  }

  // Absolute send cap within a rolling window (does NOT reset on resend) —
  // bounds brute-force to MAX_SENDS × MAX_ATTEMPTS guesses per window and
  // prevents SMS-bombing a number by repeatedly re-sending.
  const windowStart = existing?.first_sent_at ? Date.parse(String(existing.first_sent_at)) : Date.now();
  const withinWindow = Date.now() - windowStart < SEND_WINDOW_MS;
  const priorSends = withinWindow ? Number(existing?.send_count ?? 0) : 0;
  if (priorSends >= MAX_SENDS_PER_WINDOW) {
    return NextResponse.json(
      { error: "Too many verification attempts — try again later." },
      { status: 429 },
    );
  }

  // Per-TARGET throttle: block bombing an arbitrary victim number by ensuring
  // no OTHER user has an active (recent) code out to the same phone.
  const { data: targetActive } = await db
    .from("phone_verifications")
    .select("user_id, created_at")
    .eq("phone", phone)
    .neq("user_id", user.id)
    .gt("created_at", new Date(Date.now() - RESEND_THROTTLE_MS).toISOString())
    .limit(1);
  if ((targetActive ?? []).length > 0) {
    return NextResponse.json({ error: "That number was just sent a code — try again shortly." }, { status: 429 });
  }

  const code = String(randomInt(100000, 999999));
  const nowIso = new Date().toISOString();
  const { error } = await db.from("phone_verifications").upsert(
    {
      user_id: user.id,
      phone,
      code_hash: hashCode(code),
      expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
      attempts: 0,
      send_count: priorSends + 1,
      first_sent_at: withinWindow && existing?.first_sent_at ? existing.first_sent_at : nowIso,
      created_at: nowIso,
    },
    { onConflict: "user_id" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const fromNumber =
    (await db.from("profiles").select("sms_from_number").eq("id", user.id).maybeSingle()).data?.sms_from_number ??
    process.env.TWILIO_DEFAULT_FROM ??
    "";
  const sent = await sendSms(phone, `Your Axis verification code is ${code}. It expires in 10 minutes.`, String(fromNumber));
  if (!sent.sent) {
    return NextResponse.json(
      { error: sent.error ? `Could not send SMS: ${sent.error}` : "SMS is not configured yet — add Twilio credentials." },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true });
}

/** PUT — confirm the code; stores the verified phone on the profile. */
export async function PUT(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { code?: string };
  const code = String(body.code ?? "").trim();
  if (!/^\d{6}$/.test(code)) return NextResponse.json({ error: "Enter the 6-digit code." }, { status: 400 });

  const db = createSupabaseServiceRoleClient();
  const { data: row } = await db.from("phone_verifications").select("*").eq("user_id", user.id).maybeSingle();
  if (!row) return NextResponse.json({ error: "No verification in progress." }, { status: 400 });
  if (Date.parse(String(row.expires_at)) < Date.now()) {
    return NextResponse.json({ error: "Code expired — request a new one." }, { status: 400 });
  }
  if (Number(row.attempts ?? 0) >= MAX_ATTEMPTS) {
    return NextResponse.json({ error: "Too many attempts — request a new code." }, { status: 429 });
  }

  if (hashCode(code) !== String(row.code_hash)) {
    await db
      .from("phone_verifications")
      .update({ attempts: Number(row.attempts ?? 0) + 1 })
      .eq("user_id", user.id);
    return NextResponse.json({ error: "Incorrect code." }, { status: 400 });
  }

  const { error } = await db
    .from("profiles")
    .update({ phone: String(row.phone), phone_verified_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await db.from("phone_verifications").delete().eq("user_id", user.id);
  return NextResponse.json({ ok: true, phone: row.phone });
}

/** PATCH — update SMS preferences (inbound forwarding toggle). */
export async function PATCH(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { forwardInbound?: boolean };
  if (typeof body.forwardInbound !== "boolean") {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }
  const db = createSupabaseServiceRoleClient();
  const { error } = await db
    .from("profiles")
    .update({ sms_forward_inbound: body.forwardInbound })
    .eq("id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
