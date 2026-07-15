import { NextResponse } from "next/server";
import { verifyLinqWebhook } from "@/lib/linq.server";
import { sendPushToUser } from "@/lib/push-notifications.server";
import { recordOptIn, recordOptOut } from "@/lib/sms-consent";
import { sendManagerNoticeEmail, upsertManagerInboxNotice } from "@/lib/sms-inbox-notice.server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

const SMS_STOP_KEYWORDS = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"]);
const SMS_START_KEYWORDS = new Set(["START", "YES", "UNSTOP"]);

type LinqEnvelope = {
  event_type?: string;
  event_id?: string;
  data?: {
    chat?: { id?: string };
    sender_handle?: { handle?: string; phone_number?: string; service?: string };
    parts?: Array<{ type?: string; value?: string }>;
    sent_at?: string;
  };
};

function digitsOf(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits;
}

/** Common storage formats for one US number, for profiles.phone matching. */
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

/**
 * Linq inbound webhook (Standard Webhooks signed). A resident texting the Linq
 * line — the ONE number they have for tours, leases, and property questions —
 * lands in the Linq-enabled manager's PropLane inbox (+ email + push).
 *
 * Configure at Linq: webhook subscription → target this URL, events
 * ["message.received", "chat.created"].
 */
export async function POST(req: Request) {
  const rawBody = await req.text();
  const verified = verifyLinqWebhook({
    id: req.headers.get("webhook-id"),
    timestamp: req.headers.get("webhook-timestamp"),
    signature: req.headers.get("webhook-signature"),
    rawBody,
  });
  if (!verified) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  let envelope: LinqEnvelope;
  try {
    envelope = JSON.parse(rawBody) as LinqEnvelope;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  // Only inbound messages create inbox notices; delivery/read/etc. are acked.
  if (envelope.event_type !== "message.received") {
    return NextResponse.json({ ok: true, ignored: envelope.event_type ?? "unknown" });
  }

  const data = envelope.data ?? {};
  const fromPhone = String(data.sender_handle?.phone_number ?? data.sender_handle?.handle ?? "").trim();
  const text = (data.parts ?? [])
    .filter((p) => p?.type === "text" && typeof p.value === "string")
    .map((p) => String(p.value))
    .join("\n")
    .trim();
  const chatId = String(data.chat?.id ?? "").trim();
  if (!fromPhone) return NextResponse.json({ ok: true, ignored: "no_sender" });

  const db = createSupabaseServiceRoleClient();

  // Idempotency: Linq retries failed webhooks up to 10 times over 2 hours.
  // Same log + unique message_sid the Twilio inbound path uses.
  const eventId = String(envelope.event_id ?? "").trim();
  if (eventId) {
    const messageSid = `linq_${eventId}`;
    const { data: seen } = await db
      .from("inbound_sms_log")
      .select("id")
      .eq("message_sid", messageSid)
      .limit(1);
    if ((seen ?? []).length > 0) {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    await db
      .from("inbound_sms_log")
      .insert({ from_phone: fromPhone, to_phone: process.env.LINQ_FROM_NUMBER?.trim() ?? "linq", body: text, message_sid: messageSid })
      .then(() => undefined, () => undefined);
  }

  // Compliance keywords still honored on this channel.
  const keyword = text.toUpperCase();
  if (SMS_STOP_KEYWORDS.has(keyword)) {
    await recordOptOut(db, fromPhone);
    return NextResponse.json({ ok: true });
  }
  if (SMS_START_KEYWORDS.has(keyword)) {
    await recordOptIn(db, fromPhone);
    return NextResponse.json({ ok: true });
  }

  // Route to every Linq-enabled manager (the line is shared per environment).
  const allowEmails = (process.env.LINQ_MANAGER_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (allowEmails.length === 0) {
    return NextResponse.json({ ok: true, ignored: "no_linq_managers" });
  }
  const { data: managers } = await db
    .from("profiles")
    .select("id, email, full_name")
    .in("email", allowEmails);

  // Label the sender when their phone matches a known profile (display only —
  // SMS sender numbers are spoofable, so never attribute account identity).
  const { data: senderRows } = await db
    .from("profiles")
    .select("id, email, full_name")
    .in("phone", phoneVariants(fromPhone))
    .limit(1);
  const sender = (senderRows ?? [])[0];
  const senderLabel = (sender?.full_name as string | undefined)?.trim() || (sender?.email as string | undefined) || fromPhone;
  const displayLabel = sender ? `${senderLabel} (${fromPhone})` : fromPhone;

  const subject = `Text message from ${displayLabel}`;
  const noticeBody = `${text || "(empty message)"}\n\n— Inbound text to your PropLane line (via Linq${chatId ? `, chat ${chatId}` : ""}; sender not identity-verified).`;

  for (const manager of managers ?? []) {
    const managerUserId = String(manager.id ?? "").trim();
    if (!managerUserId) continue;
    await upsertManagerInboxNotice(db, {
      managerUserId,
      idPrefix: "linq_inbound",
      threadType: "inbound_sms",
      from: `Text from ${displayLabel}`,
      subject,
      preview: text || "(empty message)",
      body: noticeBody,
    });
    await sendManagerNoticeEmail({ toEmail: manager.email as string | null, subject, text: noticeBody });
    await sendPushToUser(managerUserId, {
      title: subject,
      body: (text || "(empty message)").slice(0, 120).replace(/\n/g, " "),
      url: "/portal/inbox/unopened",
    }).catch(() => undefined);
  }

  return NextResponse.json({ ok: true });
}
