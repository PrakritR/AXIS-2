/**
 * Checkr webhook receiver. Optional: the manager UI already polls for status,
 * but a `report.completed` webhook gives instant propagation without polling —
 * preferred once check volume grows. Point Checkr's webhook at
 * `{NEXT_PUBLIC_APP_URL}/api/webhooks/screening/checkr`.
 *
 * Untrusted input: verify the signature before trusting the payload, and only
 * ever look the report up by id — never act on model/attacker-supplied fields.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { applyBackgroundCheckReport } from "@/lib/checkr/background-check";
import { checkrWebhookSecret } from "@/lib/checkr/config";
import type { CheckrReportStatus, CheckrResult } from "@/lib/checkr/types";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

function verifySignature(rawBody: string, signature: string | null, secret: string | null): boolean {
  if (!secret) return process.env.NODE_ENV !== "production";
  if (!signature?.trim()) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  try {
    return timingSafeEqual(Buffer.from(signature.trim()), Buffer.from(expected));
  } catch {
    return false;
  }
}

function normalizeStatus(value: unknown): CheckrReportStatus {
  const s = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (s === "complete" || s === "completed") return "complete";
  if (s === "suspended") return "suspended";
  if (s === "dispute") return "dispute";
  if (s === "canceled" || s === "cancelled") return "canceled";
  return "pending";
}

function normalizeResult(value: unknown): CheckrResult {
  const s = typeof value === "string" ? value.trim().toLowerCase() : "";
  return s === "clear" ? "clear" : s === "consider" ? "consider" : null;
}

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-checkr-signature") ?? req.headers.get("X-Checkr-Signature");
    if (!verifySignature(rawBody, signature, checkrWebhookSecret())) {
      return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
    }

    const payload = JSON.parse(rawBody) as {
      type?: string;
      data?: { object?: Record<string, unknown> };
    };
    const object = payload.data?.object ?? {};
    const reportId = typeof object.id === "string" ? object.id : null;
    if (!reportId) return NextResponse.json({ ok: true, ignored: true });

    const db = createSupabaseServiceRoleClient();
    const row = await applyBackgroundCheckReport(db, reportId, {
      status: normalizeStatus(object.status),
      result: normalizeResult(object.result),
      assessment: typeof object.assessment === "string" ? object.assessment : null,
    });
    if (!row) return NextResponse.json({ ok: true, ignored: true });
    return NextResponse.json({ ok: true, applicationId: row.id });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Webhook failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
