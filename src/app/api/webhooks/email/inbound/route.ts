/**
 * Inbound support-email webhook — the public support address's front door.
 *
 * Mail to support@prop-lane.space is routed to Resend Inbound, which POSTs an
 * `email.received` event here (Svix-signed). We verify the signature and write the
 * thread row INLINE, so a failed write answers 5xx and Resend retries instead of
 * the mail vanishing behind an early ack; only the body enrichment runs in
 * after(). Otherwise it mirrors the Twilio SMS webhook's posture: nodejs runtime,
 * fail-closed on Vercel, in-memory rate limit, service-role Supabase client.
 *
 * Configure in the Resend dashboard:
 *   • Receiving → add the MX record so support@prop-lane.space routes to Resend
 *   • Webhooks → subscribe `email.received` to
 *       {APP_URL}/api/webhooks/email/inbound
 *   • Set RESEND_INBOUND_WEBHOOK_SECRET to that endpoint's signing secret (whsec_…)
 * See docs/agents/inbound-email-inbox.md for the full captain-side runbook.
 */
import { after } from "next/server";
import {
  backfillInboundEmailBody,
  ingestInboundEmail,
  parseInboundEmailWebhook,
} from "@/lib/inbound-email/inbound-email.server";
import { verifyResendWebhookSignature } from "@/lib/inbound-email/verify-signature";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Bounded constant key — the shared rateLimit map never evicts, so never interpolate here. */
const GLOBAL_RATE_LIMIT_KEY = "email-inbound:instance";

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

  // Two shed valves, both acking 200 (a non-2xx makes the provider retry,
  // amplifying a flood) and both logged so a dropped message is diagnosable.
  //
  // Coarse instance-wide backstop first: the per-sender key below is
  // attacker-chosen, so a flood rotating its From would otherwise never trip a
  // limit — and checking the aggregate first also bounds how many per-sender
  // buckets a single window can mint.
  if (!rateLimit(GLOBAL_RATE_LIMIT_KEY, 300, 60_000).ok) {
    console.warn("inbound-email rate-limited (instance)", parsed.fromEmail, parsed.emailId);
    return ok({ rateLimited: "instance" });
  }
  // Per-SENDER valve — every request arrives from Resend's own IPs, so an
  // IP-keyed bucket would be a global ceiling one noisy sender could exhaust for
  // everyone.
  if (!rateLimit(`email-inbound:${parsed.fromEmail}`, 120, 60_000).ok) {
    console.warn("inbound-email rate-limited", parsed.fromEmail, parsed.emailId);
    return ok({ rateLimited: true });
  }

  let created: boolean;
  try {
    ({ created } = await ingestInboundEmail(parsed));
  } catch (e) {
    // Never a silent drop: 5xx makes Resend redeliver, and the deterministic
    // thread id keeps that retry idempotent.
    console.error("inbound-email ingest failed", parsed.emailId, e);
    return new Response("Ingest failed", { status: 500 });
  }

  // The mail is safely stored; fetching its body is enrichment, so it runs off
  // the response path — where it can afford to retry, since acking 200 means no
  // redelivery is coming to try again for us.
  const enrich = () =>
    backfillInboundEmailBody(parsed).catch((e) =>
      console.warn("inbound-email body backfill errored", parsed.emailId, e),
    );
  try {
    after(enrich);
  } catch {
    void enrich();
  }

  return created ? ok() : ok({ idempotent: true });
}
