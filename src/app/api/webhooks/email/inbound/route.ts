/**
 * Inbound support-email webhook — the public support address's front door.
 *
 * Mail to support@prop-lane.space is routed to Resend Inbound, which POSTs an
 * `email.received` event here (Svix-signed). We verify the signature and ingest
 * the email into the admin portal inbox INLINE, so a failed write answers 5xx and
 * Resend retries instead of the mail vanishing behind an early ack. Otherwise it
 * mirrors the Twilio SMS webhook's posture: nodejs runtime, fail-closed on
 * Vercel, in-memory rate limit, service-role Supabase client.
 *
 * Configure in the Resend dashboard:
 *   • Receiving → add the MX record so support@prop-lane.space routes to Resend
 *   • Webhooks → subscribe `email.received` to
 *       {APP_URL}/api/webhooks/email/inbound
 *   • Set RESEND_INBOUND_WEBHOOK_SECRET to that endpoint's signing secret (whsec_…)
 * See docs/agents/inbound-email-inbox.md for the full captain-side runbook.
 */
import { ingestInboundEmail, parseInboundEmailWebhook } from "@/lib/inbound-email/inbound-email.server";
import { verifyResendWebhookSignature } from "@/lib/inbound-email/verify-signature";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

function ok(extra?: Record<string, unknown>): Response {
  return Response.json({ ok: true, ...extra });
}

export async function POST(req: Request) {
  const raw = await req.text();
  const secret = process.env.RESEND_INBOUND_WEBHOOK_SECRET?.trim();
  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");

  // Fail closed on any deployed environment. Only local dev may run unsigned
  // (no secret configured / no signature headers) — mirrors the Twilio route.
  if (!secret || !svixSignature) {
    if (process.env.VERCEL) return new Response("Forbidden", { status: 403 });
  } else {
    const verified = verifyResendWebhookSignature({
      rawBody: raw,
      headers: { id: svixId, timestamp: svixTimestamp, signature: svixSignature },
      secret,
    });
    if (!verified) return new Response("Forbidden", { status: 403 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return ok({ ignored: "unparseable" });
  }

  const parsed = parseInboundEmailWebhook(payload);
  // Non-inbound events (deliveries, bounces, connectivity probes) ack quietly.
  if (!parsed) return ok({ ignored: "not-received" });

  // Per-SENDER shed valve — every request arrives from Resend's own IPs, so an
  // IP-keyed bucket would be a global ceiling one noisy sender could exhaust for
  // everyone. Over-limit still acks 200 (a non-2xx makes the provider retry,
  // amplifying a flood) but is logged so a dropped message is diagnosable.
  if (!rateLimit(`email-inbound:${parsed.fromEmail}`, 120, 60_000).ok) {
    console.warn("inbound-email rate-limited", parsed.fromEmail, parsed.emailId);
    return ok({ rateLimited: true });
  }

  try {
    const { created } = await ingestInboundEmail(parsed);
    return created ? ok() : ok({ idempotent: true });
  } catch (e) {
    // Never a silent drop: 5xx makes Resend redeliver, and the deterministic
    // thread id keeps that retry idempotent.
    console.error("inbound-email ingest failed", parsed.emailId, e);
    return new Response("Ingest failed", { status: 500 });
  }
}
