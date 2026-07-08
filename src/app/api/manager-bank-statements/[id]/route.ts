import { NextResponse } from "next/server";
import { assertManagerFinancialsAccess, getReportsAuthContext } from "@/lib/reports/auth";
import { setStatementReconciled } from "@/lib/manager-bank-reconciliation.server";
import { track } from "@/lib/analytics/posthog";

export const runtime = "nodejs";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getReportsAuthContext({ preferRole: "manager" });
    if (!auth) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const gate = await assertManagerFinancialsAccess(auth);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const { id } = await ctx.params;
    const body = (await req.json()) as { reconciled?: boolean };
    const reconciled = body.reconciled !== false;
    await setStatementReconciled(auth.db, auth.userId, id, reconciled);
    if (reconciled) track("bank_statement_reconciled", auth.userId, { statementId: id });
    return NextResponse.json({ ok: true, reconciled });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Reconcile failed." }, { status: 500 });
  }
}
