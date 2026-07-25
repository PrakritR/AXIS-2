import { NextResponse } from "next/server";

import { syncGmailPaymentReceipts } from "@/lib/gmail-payments/sync.server";
import { requireManager } from "@/lib/gmail-payments/require-manager.server";

export const runtime = "nodejs";

export async function POST() {
  try {
    const ctx = await requireManager();
    if (!ctx) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const result = await syncGmailPaymentReceipts(ctx.db, ctx.userId);
    return NextResponse.json({ result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
