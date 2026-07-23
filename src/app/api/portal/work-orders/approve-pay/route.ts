import { NextResponse } from "next/server";
import type { DemoManagerWorkOrderRow } from "@/data/demo-portal";
import { assertManagerFinancialsAccess, getReportsAuthContext } from "@/lib/reports/auth";
import type { WorkOrderCategory } from "@/lib/reports/categories";
import { approveAndPayWorkOrder } from "@/lib/work-order-approve-pay.server";

export const runtime = "nodejs";

/** Manager's one-tap (or confirm-preview, for larger amounts — gated client-side) "Approve
 * + Pay": delegates to approveAndPayWorkOrder (work-order-approve-pay.server.ts) — the same
 * completion + expense-logging + markWorkOrderPaid + best-effort Stripe payout +
 * notifications implementation the agent tool layer uses. */
export async function POST(req: Request) {
  try {
    const auth = await getReportsAuthContext({ preferRole: "manager" });
    if (!auth) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const gate = await assertManagerFinancialsAccess(auth);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const body = (await req.json()) as {
      workOrder?: DemoManagerWorkOrderRow;
      category?: WorkOrderCategory;
      vendorCostCents?: number;
      materialsCostCents?: number;
      materialsMemo?: string;
      workDoneSummary?: string;
      paymentChannel?: "ach" | "zelle" | "venmo";
    };

    const result = await approveAndPayWorkOrder(
      auth.db,
      { userId: auth.userId, email: auth.email, isAdmin: auth.role === "admin" },
      body,
    );
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true, workOrder: result.workOrder, expenseEntryIds: result.expenseEntryIds });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
