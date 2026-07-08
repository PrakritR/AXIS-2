import { NextResponse } from "next/server";
import { assertManagerFinancialsAccess, getReportsAuthContext } from "@/lib/reports/auth";
import { approveManagerBill, payManagerBill } from "@/lib/manager-bills.server";
import { track } from "@/lib/analytics/posthog";

export const runtime = "nodejs";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await getReportsAuthContext({ preferRole: "manager" });
    if (!auth) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const gate = await assertManagerFinancialsAccess(auth);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const { id } = await ctx.params;
    const body = (await req.json()) as { action?: "approve" | "pay" | "void" };

    if (body.action === "approve") {
      const bill = await approveManagerBill(auth.db, auth.userId, id, auth.userId);
      track("bill_approved", auth.userId, { billId: bill.id, amountCents: bill.amountCents });
      return NextResponse.json({ bill });
    }

    if (body.action === "pay") {
      const bill = await payManagerBill(auth.db, auth.userId, id);
      track("bill_paid", auth.userId, { billId: bill.id, amountCents: bill.amountCents });
      return NextResponse.json({ bill });
    }

    if (body.action === "void") {
      const now = new Date().toISOString();
      const { data, error } = await auth.db
        .from("manager_bills")
        .update({ status: "void", updated_at: now })
        .eq("id", id)
        .eq("manager_user_id", auth.userId)
        .select("id")
        .maybeSingle();
      if (error || !data) return NextResponse.json({ error: "Bill not found." }, { status: 404 });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Bill update failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
