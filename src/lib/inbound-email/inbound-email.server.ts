/**
 * Inbound support email → admin portal inbox.
 *
 * Mail sent to the public support address (support@prop-lane.space) is routed to
 * Resend Inbound, which POSTs an `email.received` webhook to
 * `/api/webhooks/email/inbound`. That route verifies the Svix signature and hands
 * the parsed metadata here. We turn it into a `portal_inbox_thread_records` row
 * under the ADMIN scope — the exact rail the public contact-message form already
 * uses (`src/app/api/public/contact-message/route.ts`) — so support mail lands in
 * the founder/admin portal inbox alongside every other unified-inbox thread.
 *
 * Resend inbound webhooks carry metadata only (from/to/subject/id); the body is
 * fetched separately from Resend's received-email API. The fetch is best-effort:
 * if it fails, the thread still appears with subject + sender so the admin can
 * follow up (never a silent drop).
 */
import { buildPortalInboxThreadUpsert } from "@/lib/portal-inbox-thread-upsert";
import { ADMIN_INBOX_SCOPE } from "@/lib/portal-inbox-thread-scope";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const INBOUND_EMAIL_THREAD_ID_PREFIX = "inbound_email_";
/** Hard cap on stored body length — keeps a giant email from bloating the row. */
export const INBOUND_EMAIL_BODY_MAX_CHARS = 20_000;

export type ParsedInboundEmail = {
  emailId: string;
  fromEmail: string;
  fromName: string;
  toEmails: string[];
  subject: string;
  receivedAt: string;
  /** Present only if the provider inlined the body on the webhook (usually not). */
  text?: string;
  html?: string;
};

/** Deterministic thread id keyed off the provider message id → idempotent upsert. */
export function inboundEmailThreadId(emailId: string): string {
  return `${INBOUND_EMAIL_THREAD_ID_PREFIX}${emailId.trim()}`;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Split `"Acme <hi@acme.com>"` → { name: "Acme", email: "hi@acme.com" }. */
export function parseEmailAddress(raw: string): { name: string; email: string } {
  const value = raw.trim();
  const angled = value.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (angled) {
    const name = angled[1]!.replace(/^["']|["']$/g, "").trim();
    return { name, email: angled[2]!.trim().toLowerCase() };
  }
  return { name: "", email: value.toLowerCase() };
}

function toEmailList(value: unknown): string[] {
  const items = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  return items
    .map((entry) => parseEmailAddress(asString(entry)).email)
    .filter((email) => email.includes("@"));
}

/**
 * Extract the fields we need from a Resend `email.received` webhook. Returns null
 * for any other event type or a malformed payload so the route can ack-and-ignore
 * without creating a thread.
 */
export function parseInboundEmailWebhook(payload: unknown): ParsedInboundEmail | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  if (asString(root.type) !== "email.received") return null;

  const data = (root.data && typeof root.data === "object" ? root.data : {}) as Record<string, unknown>;
  const emailId = asString(data.email_id) || asString(data.id);
  const fromRaw = asString(data.from);
  if (!emailId || !fromRaw) return null;

  const { name, email } = parseEmailAddress(fromRaw);
  if (!email.includes("@")) return null;

  const receivedAt = asString(data.created_at) || asString(root.created_at) || new Date().toISOString();

  return {
    emailId,
    fromEmail: email,
    fromName: name,
    toEmails: toEmailList(data.to),
    subject: asString(data.subject),
    receivedAt,
    text: typeof data.text === "string" ? data.text : undefined,
    html: typeof data.html === "string" ? data.html : undefined,
  };
}

/** Minimal, dependency-free HTML → text: drop scripts/styles, keep line breaks. */
export function htmlToText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*\/\s*(p|div|tr|li|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Clamp to a stored-body ceiling, appending a marker when truncated. */
export function clampBody(body: string): string {
  const trimmed = body.trim();
  if (trimmed.length <= INBOUND_EMAIL_BODY_MAX_CHARS) return trimmed;
  return `${trimmed.slice(0, INBOUND_EMAIL_BODY_MAX_CHARS)}\n\n… (truncated)`;
}

/**
 * Fetch the full plain-text body for a received email from Resend. Metadata-only
 * webhooks mean the body lives behind the received-email API, reached with the
 * same RESEND_API_KEY used for outbound. Best-effort: returns "" on any failure.
 *
 * The path follows Resend's documented `receiving` namespace; override the base
 * with RESEND_INBOUND_API_BASE if Resend's routing differs for your account.
 */
export async function fetchResendReceivedEmailBody(emailId: string): Promise<string> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return "";
  const base = (process.env.RESEND_INBOUND_API_BASE?.trim() || "https://api.resend.com").replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/emails/receiving/${encodeURIComponent(emailId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return "";
    const json = (await res.json()) as Record<string, unknown>;
    const data = (json.data && typeof json.data === "object" ? json.data : json) as Record<string, unknown>;
    const text = typeof data.text === "string" ? data.text : "";
    if (text.trim()) return text;
    const html = typeof data.html === "string" ? data.html : "";
    return html.trim() ? htmlToText(html) : "";
  } catch {
    return "";
  }
}

/** Resolve the best available body: inlined text → inlined html → API fetch. */
export async function resolveInboundEmailBody(parsed: ParsedInboundEmail): Promise<string> {
  if (parsed.text && parsed.text.trim()) return clampBody(parsed.text);
  if (parsed.html && parsed.html.trim()) return clampBody(htmlToText(parsed.html));
  const fetched = await fetchResendReceivedEmailBody(parsed.emailId);
  if (fetched.trim()) return clampBody(fetched);
  return "(No message body could be retrieved. Open the sender's email to read it.)";
}

/**
 * Build the admin-inbox row for an inbound support email. Shape mirrors the
 * `InboxMessage` the admin inbox renders (see demo-admin-partner-inbox.ts) and
 * the contact-message route: scope "admin" (owner-agnostic — visible to every
 * admin/founder), the external sender as the participant so a reply routes back.
 */
export function buildInboundEmailInboxRow(opts: { parsed: ParsedInboundEmail; bodyText: string }) {
  const { parsed, bodyText } = opts;
  return {
    id: inboundEmailThreadId(parsed.emailId),
    name: parsed.fromName || parsed.fromEmail,
    email: parsed.fromEmail,
    participantEmail: parsed.fromEmail,
    topic: parsed.subject || "(no subject)",
    body: bodyText || "(no message body)",
    createdAt: parsed.receivedAt,
    read: false,
    folder: "inbox" as const,
    // "partner" = external contact; roleAllowsThread lets an admin reply.
    senderRole: "partner" as const,
    thread: [] as never[],
    scope: ADMIN_INBOX_SCOPE,
    // Provenance for the admin UI / audit — which support address received it.
    channel: "email" as const,
    receivedTo: parsed.toEmails,
  };
}

/**
 * Ingest a parsed inbound email into the admin portal inbox. Idempotent: a
 * re-delivered webhook (same provider message id) is a no-op once the thread
 * exists, so an admin's read/reply state is never clobbered.
 */
export async function ingestInboundEmail(
  parsed: ParsedInboundEmail,
  db = createSupabaseServiceRoleClient(),
): Promise<{ created: boolean }> {
  const id = inboundEmailThreadId(parsed.emailId);
  const { data: existing } = await db
    .from("portal_inbox_thread_records")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (existing) return { created: false };

  const bodyText = await resolveInboundEmailBody(parsed);
  const row = buildInboundEmailInboxRow({ parsed, bodyText });
  const record = buildPortalInboxThreadUpsert(row, { id: "", email: null });
  const { error } = await db.from("portal_inbox_thread_records").upsert(record, { onConflict: "id" });
  if (error) throw new Error(error.message);
  return { created: true };
}
