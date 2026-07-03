/**
 * Checkr Tenant API webhook receiver. Optional: the manager UI already polls
 * for status, but a `report.completed` webhook gives instant propagation
 * without polling — preferred once check volume grows. Point Checkr's webhook
 * at `{NEXT_PUBLIC_APP_URL}/api/webhooks/screening/checkr`.
 *
 * Untrusted input: verify the signature before trusting the payload, then
 * re-fetch the order/report by id from Checkr rather than trusting any
 * status/result fields in the payload itself.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { applyBackgroundCheckReport } from "@/lib/checkr/background-check";
import { fetchBackgroundCheckReport } from "@/lib/checkr/client";
import { checkrWebhookSecret } from "@/lib/checkr/config";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

const REPLAY_TOLERANCE_SECONDS = 5 * 60;

/** `Tenant-Signature: t=<unix_ts>,v1=<hex hmac of "<t>.<raw body>">` */
function verifySignature(rawBody: string, header: string | null, secret: string | null): boolean {
  // Only local dev may run without a configured secret — any deployed
  // environment (Vercel, including preview/staging) must fail closed.
  if (!secret) return !process.env.VERCEL;
  if (!header?.trim()) return false;
  const parts = Object.fromEntries(
    header.split(",").map((piece) => piece.trim().split("=") as [string, string]),
  );
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;
  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) return false;
  if (Math.abs(Date.now() / 1000 - timestampSeconds) > REPLAY_TOLERANCE_SECONDS) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex");
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("tenant-signature") ?? req.headers.get("Tenant-Signature");
    if (!verifySignature(rawBody, signature, checkrWebhookSecret())) {
      return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
    }

    const payload = JSON.parse(rawBody) as {
      type?: string;
      data?: { id?: string; order_id?: string };
    };
    const orderId =
      typeof payload.data?.order_id === "string" ? payload.data.order_id : typeof payload.data?.id === "string" ? payload.data.id : null;

    // Only report.completed carries a finished order; other event types just ack.
    if (payload.type !== "report.completed") return NextResponse.json({ ok: true, ignored: true });

    if (!orderId) {
      console.error("checkr webhook: report.completed event had no resolvable orderId", { type: payload.type });
      return NextResponse.json({ ok: true, ignored: true });
    }

    const report = await fetchBackgroundCheckReport(orderId);
    if (!report) return NextResponse.json({ ok: true, ignored: true });

    const db = createSupabaseServiceRoleClient();
    const row = await applyBackgroundCheckReport(db, orderId, { status: report.status, result: report.result });
    if (!row) {
      console.error("checkr webhook: report.completed resolved orderId but no matching application", { orderId });
      return NextResponse.json({ ok: true, ignored: true });
    }
    return NextResponse.json({ ok: true, applicationId: row.id });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Webhook failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
