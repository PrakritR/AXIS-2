import { NextResponse } from "next/server";
import twilio from "twilio";
import { sendPushToUser } from "@/lib/push-notifications.server";
import { sendManagerNoticeEmail, upsertManagerInboxNotice } from "@/lib/sms-inbox-notice.server";
import { smsMediaAppUrl, storeInboundMedia, twilioMediaUrls } from "@/lib/sms-media.server";
import { relayInboundSms } from "@/lib/sms-relay.server";
import { sendSms } from "@/lib/twilio";
import { recordOptIn, recordOptOut } from "@/lib/sms-consent";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

/**
 * Standard carrier/Twilio SMS control keywords. Twilio's Advanced Opt-Out sends
 * the compliance auto-replies; Axis records the resulting consent state so it
 * never texts an opted-out number again, and never leaks a control message into
 * anyone's inbox. Matched case-insensitively against the entire trimmed body.
 */
const SMS_STOP_KEYWORDS = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"]);
const SMS_START_KEYWORDS = new Set(["START", "YES", "UNSTOP"]);
const SMS_HELP_KEYWORDS = new Set(["HELP", "INFO"]);

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

/** TwiML response; an optional message becomes an auto-reply to the sender. */
function twimlOk(reply?: string): NextResponse {
  const escaped = reply
    ? reply.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    : "";
  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?><Response>${escaped ? `<Message>${escaped}</Message>` : ""}</Response>`,
    {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    },
  );
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
  const mediaUrls = twilioMediaUrls(params);
  if (!fromPhone || !toPhone) return twimlOk();

  const db = createSupabaseServiceRoleClient();

  // Compliance: handle STOP/START/HELP control keywords before any routing.
  // Twilio Advanced Opt-Out already sends the required auto-reply; we only
  // record the consent change and stop — these messages must never be delivered
  // to an inbox or emailed/forwarded to the manager.
  const keyword = body.toUpperCase();
  if (SMS_STOP_KEYWORDS.has(keyword)) {
    await recordOptOut(db, fromPhone);
    return twimlOk();
  }
  if (SMS_START_KEYWORDS.has(keyword)) {
    await recordOptIn(db, fromPhone);
    return twimlOk();
  }
  if (SMS_HELP_KEYWORDS.has(keyword)) {
    return twimlOk();
  }

  // 0. Idempotency: Twilio retries on any non-2xx/timeout. Skip a MessageSid
  // we've already processed so retries don't duplicate inbox threads / emails /
  // forward SMS. (Unique index inbound_sms_log_message_sid_uniq also enforces it.)
  if (messageSid) {
    const { data: seen } = await db
      .from("inbound_sms_log")
      .select("id")
      .eq("message_sid", messageSid)
      .limit(1);
    if ((seen ?? []).length > 0) return twimlOk();
  }

  // 1a. Proxy-pair relay: if (From, To) matches an active relay binding, the
  // message is relayed to the other participant(s) and mirrored in-app; if To
  // is a pool number with no binding, the sender gets a "not linked" reply.
  // Only when To is outside the relay pool do we fall through to the
  // work-number → Axis-inbox path below.
  const relay = await relayInboundSms(db, { fromPhone, toPhone, body, messageSid, mediaUrls });
  if (relay.handled) {
    await db
      .from("inbound_sms_log")
      .insert({
        manager_user_id: relay.managerUserId ?? null,
        from_phone: fromPhone,
        to_phone: toPhone,
        matched_sender_user_id: relay.senderUserId ?? null,
        body,
        message_sid: messageSid,
      })
      .then(() => undefined, () => undefined);
    return twimlOk(relay.reply);
  }

  // 1b. The manager is whoever owns the work number that was texted.
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

  // 2b. Capture any MMS attachments into the private sms-media bucket. The
  // inbox body gets durable /api/sms-media links (signed at read time); only
  // the email body gets the immediate signed URLs (email clients aren't authed).
  const storedMedia = mediaUrls.length
    ? await storeInboundMedia(db, {
        managerUserId: manager.id,
        messageSid: messageSid ?? `unknown_${Date.now()}`,
        mediaUrls,
      })
    : [];

  // 3. Axis inbox thread + email + push to the manager.
  // Security: SMS `From` is spoofable and profiles.phone is generally
  // unverified, so we DO NOT attribute the thread to the matched sender's
  // account identity (that would let a spoofed text impersonate a resident).
  // The phone-matched label is surfaced only as display text, clearly marked
  // as an unverified inbound text.
  const displayLabel = sender ? `${senderLabel} (${fromPhone})` : fromPhone;
  const subject = `Text message from ${displayLabel}`;
  const inboxMediaNote = storedMedia.length
    ? `\n\nAttachments:\n${storedMedia.map((m) => smsMediaAppUrl(m.path)).join("\n")}`
    : "";
  const emailMediaNote = storedMedia.length
    ? `\n\nAttachments:\n${storedMedia.map((m) => m.signedUrl).join("\n")}`
    : "";
  const noticeFooter = "\n\n— Inbound text to your PropLane number (sender not identity-verified).";
  await upsertManagerInboxNotice(db, {
    managerUserId: manager.id,
    idPrefix: "sms_inbound",
    threadType: "inbound_sms",
    from: `Text from ${displayLabel}`,
    subject,
    preview: body || "(empty message)",
    body: `${body || "(empty message)"}${inboxMediaNote}${noticeFooter}`,
  });

  await sendManagerNoticeEmail({
    toEmail: manager.email,
    subject,
    text: `${body || "(empty message)"}${emailMediaNote}${noticeFooter}`,
  });

  await sendPushToUser(manager.id, {
    title: subject,
    body: (body || "(empty message)").slice(0, 120).replace(/\n/g, " "),
    url: "/portal/inbox/unopened",
  }).catch(() => undefined);

  // 4. Optional forward to the manager's personal phone — only when that
  // number was OTP-verified in Settings. An unverified profile phone must
  // never receive forwarded message bodies (typos leak tenant PII; a
  // malicious profile edit would turn the work number into a spam cannon).
  const personalPhone = String(manager.phone ?? "").trim();
  if (
    manager.sms_forward_inbound !== false &&
    Boolean(manager.phone_verified_at) &&
    personalPhone &&
    digitsOf(personalPhone) !== digitsOf(fromPhone)
  ) {
    await sendSms(personalPhone, `${senderLabel}: ${body}`.slice(0, 320), toPhone).catch(() => undefined);
  }

  return twimlOk();
}
