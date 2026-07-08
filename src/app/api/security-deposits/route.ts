import { NextResponse } from "next/server";
import {
  assertManagerFinancialsAccess,
  getReportsAuthContext,
} from "@/lib/reports/auth";
import { listSecurityDeposits } from "@/lib/reports/security-deposits";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const auth = await getReportsAuthContext({ preferRole: "manager" });
    if (!auth) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const gate = await assertManagerFinancialsAccess(auth);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const { searchParams } = new URL(req.url);
    const propertyId = searchParams.get("propertyId")?.trim() || undefined;
    const status = searchParams.get("status")?.trim() as
      | "held"
      | "partially_refunded"
      | "refunded"
      | "forfeited"
      | "applied_to_damages"
      | undefined;

    const deposits = await listSecurityDeposits(auth.db, auth.userId, { propertyId, status });
    return NextResponse.json({ deposits });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to list deposits.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
