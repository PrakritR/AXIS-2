import { createHash, randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { sendSms } from "@/lib/twilio";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

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

  // Throttle: one active code per user; a fresh request replaces it, but no
  // more than one send per 60s.
  const { data: existing } = await db.from("phone_verifications").select("created_at").eq("user_id", user.id).maybeSingle();
  if (existing && Date.now() - Date.parse(String(existing.created_at)) < 60_000) {
    return NextResponse.json({ error: "Code already sent — wait a minute before retrying." }, { status: 429 });
  }

  const code = String(randomInt(100000, 999999));
  const { error } = await db.from("phone_verifications").upsert(
    {
      user_id: user.id,
      phone,
      code_hash: hashCode(code),
      expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
      attempts: 0,
      created_at: new Date().toISOString(),
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
