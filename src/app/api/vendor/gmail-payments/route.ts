import { NextResponse } from "next/server";

import {
  clearGmailPaymentsConnection,
  gmailPaymentsPublicStatus,
  loadGmailPaymentsConnection,
} from "@/lib/gmail-payments/settings";
import { requireVendor } from "@/lib/gmail-payments/require-vendor.server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const ctx = await requireVendor();
    if (!ctx) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const connection = await loadGmailPaymentsConnection(ctx.db, ctx.userId, "vendor");
    return NextResponse.json({ status: gmailPaymentsPublicStatus(connection) });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const ctx = await requireVendor();
    if (!ctx) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    await clearGmailPaymentsConnection(ctx.db, ctx.userId, "vendor");
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
