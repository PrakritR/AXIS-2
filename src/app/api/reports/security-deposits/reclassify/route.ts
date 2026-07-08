import { NextResponse } from "next/server";
import {
  assertManagerFinancialsAccess,
  getReportsAuthContext,
} from "@/lib/reports/auth";
import { reclassifyMisclassifiedDeposits } from "@/lib/reports/security-deposits";
import { track } from "@/lib/analytics/posthog";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const auth = await getReportsAuthContext({ preferRole: "manager" });
    if (!auth) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const gate = await assertManagerFinancialsAccess(auth);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const body = (await req.json().catch(() => ({}))) as { dryRun?: boolean };
    const dryRun = body.dryRun !== false;

    const result = await reclassifyMisclassifiedDeposits(auth.db, auth.userId, { dryRun });

    if (!dryRun && result.applied && result.applied > 0) {
      track("security_deposit_reclassification_run", auth.userId, {
        rowCount: result.rowCount,
        totalCents: result.totalCents,
      });
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Reclassification failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
