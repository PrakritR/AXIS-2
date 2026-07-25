import { NextResponse } from "next/server";

import { syncGmailPaymentReceipts } from "@/lib/gmail-payments/sync.server";
import { requireVendor } from "@/lib/gmail-payments/require-vendor.server";

export const runtime = "nodejs";

export async function POST() {
  try {
    const ctx = await requireVendor();
    if (!ctx) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const result = await syncGmailPaymentReceipts(ctx.db, ctx.userId, "vendor");
    return NextResponse.json({ result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
