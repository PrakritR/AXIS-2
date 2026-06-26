import { NextResponse } from "next/server";
import { getScreeningProvider } from "@/lib/screening/providers";
import {
  applyScreeningReportToApplication,
  findApplicationIdFromCertnPayload,
} from "@/lib/screening/order-screening";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const payload = JSON.parse(rawBody) as Record<string, unknown>;
    const provider = getScreeningProvider();
    const signature = req.headers.get("certn-signature") ?? req.headers.get("Certn-Signature");

    if (!provider.verifyWebhookSignature(rawBody, signature)) {
      return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
    }

    const vendorReport = provider.parseWebhookPayload(payload);
    if (!vendorReport) {
      return NextResponse.json({ error: "Unrecognized payload." }, { status: 400 });
    }

    const db = createSupabaseServiceRoleClient();
    const applicationId = await findApplicationIdFromCertnPayload(db, payload);
    if (!applicationId) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    await applyScreeningReportToApplication(db, applicationId, vendorReport);
    return NextResponse.json({ ok: true, applicationId });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Webhook failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
