/**
 * Inbound support-email webhook — the public support address's front door.
 *
 * Mail to support@prop-lane.space is routed to Resend Inbound, which POSTs an
 * `email.received` event here (Svix-signed). We verify the signature, ack fast,
 * and ingest the email into the admin portal inbox via after(), mirroring the
 * Twilio SMS webhook's posture: nodejs runtime, fail-closed on Vercel, in-memory
 * rate limit, service-role Supabase client.
 *
 * Configure in the Resend dashboard:
 *   • Receiving → add the MX record so support@prop-lane.space routes to Resend
 *   • Webhooks → subscribe `email.received` to
 *       {APP_URL}/api/webhooks/email/inbound
 *   • Set RESEND_INBOUND_WEBHOOK_SECRET to that endpoint's signing secret (whsec_…)
 * See docs/agents/inbound-email-inbox.md for the full captain-side runbook.
 */
import { after } from "next/server";
import { ingestInboundEmail, parseInboundEmailWebhook } from "@/lib/inbound-email/inbound-email.server";
import { verifyResendWebhookSignature } from "@/lib/inbound-email/verify-signature";
import { clientIpFrom, rateLimit } from "@/lib/rate-limit";

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

  // Per-IP shed valve. Over-limit still acks 200 — a non-2xx makes the provider
  // retry, which would amplify a flood instead of absorbing it.
  if (!rateLimit(`email-inbound:${clientIpFrom(req)}`, 120, 60_000).ok) {
    return ok({ rateLimited: true });
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

  const task = () =>
    ingestInboundEmail(parsed).catch((e) => console.error("inbound-email ingest failed", parsed.emailId, e));
  try {
    after(task);
  } catch {
    void task();
  }
  return ok();
}
