import { NextResponse } from "next/server";
import { assertManagerFinancialsAccess, getReportsAuthContext } from "@/lib/reports/auth";
import { mapManagerBillRow, MANAGER_BILL_SELECT } from "@/lib/manager-bills";
import { approveManagerBill, createManagerBill, payManagerBill } from "@/lib/manager-bills.server";
import { track } from "@/lib/analytics/posthog";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const auth = await getReportsAuthContext({ preferRole: "manager" });
    if (!auth) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const gate = await assertManagerFinancialsAccess(auth);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const status = new URL(req.url).searchParams.get("status")?.trim();
    let query = auth.db
      .from("manager_bills")
      .select(MANAGER_BILL_SELECT)
      .eq("manager_user_id", auth.userId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ bills: (data ?? []).map((r) => mapManagerBillRow(r as Record<string, unknown>)) });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to list bills.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await getReportsAuthContext({ preferRole: "manager" });
    if (!auth) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const gate = await assertManagerFinancialsAccess(auth);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const body = (await req.json()) as {
      description?: string;
      amountCents?: number;
      dueDate?: string;
      vendorId?: string;
      workOrderId?: string;
      propertyId?: string;
      categoryCode?: string;
    };

    const bill = await createManagerBill(auth.db, {
      managerUserId: auth.userId,
      description: body.description?.trim() || "Bill",
      amountCents: Math.round(Number(body.amountCents) || 0),
      dueDate: body.dueDate,
      vendorId: body.vendorId,
      workOrderId: body.workOrderId,
      propertyId: body.propertyId,
      categoryCode: body.categoryCode,
    });

    track("bill_created", auth.userId, { billId: bill.id, amountCents: bill.amountCents });
    return NextResponse.json({ bill });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create bill.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
