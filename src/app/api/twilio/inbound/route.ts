import { NextResponse } from "next/server";
import twilio from "twilio";
import { deliverPortalInboxMessage } from "@/lib/portal-inbox-delivery";
import { sendSms } from "@/lib/twilio";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

function digitsOf(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits;
}

/** Common storage formats for one US number, for direct-column matching. */
function phoneVariants(raw: string): string[] {
  const d = digitsOf(raw);
  if (d.length !== 10) return [raw.trim()].filter(Boolean);
  return [
    `+1${d}`,
    d,
    `1${d}`,
    `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`,
    `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`,
    raw.trim(),
  ].filter(Boolean);
}

/** TwiML no-op response so Twilio doesn't retry or error. */
function twimlOk(): NextResponse {
  return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

type PhoneProfile = {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  phone_verified_at: string | null;
  sms_forward_inbound: boolean | null;
};

/**
 * Twilio inbound SMS webhook. A resident/vendor replies to a manager's work
 * number → the message lands in the manager's Axis inbox, is emailed to them,
 * and (when enabled + verified) is forwarded as SMS to their personal phone.
 *
 * Configure in Twilio: Messaging webhook → POST https://<host>/api/twilio/inbound
 */
export async function POST(req: Request) {
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!authToken) return NextResponse.json({ error: "SMS not configured." }, { status: 503 });

  const raw = await req.text();
  const params = Object.fromEntries(new URLSearchParams(raw));

  // Signature check — reject spoofed webhook calls.
  const signature = req.headers.get("x-twilio-signature") ?? "";
  const url = process.env.TWILIO_WEBHOOK_URL?.trim() || req.url;
  if (!twilio.validateRequest(authToken, signature, url, params)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 403 });
  }

  const fromPhone = String(params.From ?? "").trim();
  const toPhone = String(params.To ?? "").trim();
  const body = String(params.Body ?? "").trim();
  const messageSid = String(params.MessageSid ?? "").trim() || null;
  if (!fromPhone || !toPhone) return twimlOk();

  const db = createSupabaseServiceRoleClient();

  // 1. The manager is whoever owns the work number that was texted.
  const { data: managerRows } = await db
    .from("profiles")
    .select("id, email, full_name, phone, phone_verified_at, sms_forward_inbound")
    .in("sms_from_number", phoneVariants(toPhone))
    .limit(1);
  const manager = (managerRows ?? [])[0] as PhoneProfile | undefined;
  if (!manager) {
    await db
      .from("inbound_sms_log")
      .insert({ from_phone: fromPhone, to_phone: toPhone, body, message_sid: messageSid })
      .then(() => undefined, () => undefined);
    return twimlOk();
  }

  // 2. Identify the sender by their stored phone (resident/vendor/anyone known).
  const { data: senderRows } = await db
    .from("profiles")
    .select("id, email, full_name")
    .in("phone", phoneVariants(fromPhone))
    .neq("id", manager.id)
    .limit(1);
  const sender = (senderRows ?? [])[0] as Pick<PhoneProfile, "id" | "email" | "full_name"> | undefined;
  const senderLabel = sender?.full_name?.trim() || sender?.email || fromPhone;

  await db
    .from("inbound_sms_log")
    .insert({
      manager_user_id: manager.id,
      from_phone: fromPhone,
      to_phone: toPhone,
      matched_sender_user_id: sender?.id ?? null,
      body,
      message_sid: messageSid,
    })
    .then(() => undefined, () => undefined);

  // 3. Axis inbox thread + email to the manager.
  await deliverPortalInboxMessage(db, {
    senderUserId: sender?.id ?? manager.id,
    senderEmail: sender?.email ?? manager.email ?? "",
    fromName: sender ? senderLabel : `Text from ${fromPhone}`,
    subject: `Text message from ${senderLabel}`,
    text: body || "(empty message)",
    toUserIds: [manager.id],
    deliverToPortalInbox: true,
    deliverViaEmail: true,
  }).catch(() => undefined);

  // 4. Optional forward to the manager's verified personal phone.
  const personalPhone = String(manager.phone ?? "").trim();
  if (
    manager.sms_forward_inbound !== false &&
    personalPhone &&
    manager.phone_verified_at &&
    digitsOf(personalPhone) !== digitsOf(fromPhone)
  ) {
    await sendSms(personalPhone, `${senderLabel}: ${body}`.slice(0, 320), toPhone).catch(() => undefined);
  }

  return twimlOk();
}
