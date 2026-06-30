import { NextResponse } from "next/server";
import { track } from "@/lib/analytics/posthog";
import type { DemoManagerWorkOrderRow } from "@/data/demo-portal";
import { assertManagerFinancialsAccess, getReportsAuthContext } from "@/lib/reports/auth";
import type { WorkOrderCategory } from "@/lib/reports/categories";
import { createExpensesFromWorkOrder, mergeWorkOrderCompletion } from "@/lib/work-order-expenses";

export const runtime = "nodejs";

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
    };

    const workOrder = body.workOrder;
    if (!workOrder?.id) return NextResponse.json({ error: "workOrder required." }, { status: 400 });
    if (!body.category) return NextResponse.json({ error: "category required." }, { status: 400 });

    const expenseEntryIds = await createExpensesFromWorkOrder(auth.db, auth.userId, {
      workOrderId: workOrder.id,
      category: body.category,
      vendorCostCents: body.vendorCostCents,
      materialsCostCents: body.materialsCostCents,
      materialsMemo: body.materialsMemo,
      workDoneSummary: body.workDoneSummary,
      propertyId: workOrder.propertyId || workOrder.assignedPropertyId,
      vendorId: workOrder.vendorId,
    });

    const updated = mergeWorkOrderCompletion(
      workOrder,
      {
        workOrderId: workOrder.id,
        category: body.category,
        vendorCostCents: body.vendorCostCents,
        materialsCostCents: body.materialsCostCents,
        materialsMemo: body.materialsMemo,
        workDoneSummary: body.workDoneSummary,
        propertyId: workOrder.propertyId,
        vendorId: workOrder.vendorId,
      },
      expenseEntryIds,
    );

    const { error } = await auth.db.from("portal_work_order_records").upsert(
      {
        id: workOrder.id,
        manager_user_id: auth.userId,
        property_id: workOrder.propertyId ?? null,
        resident_email: workOrder.residentEmail ?? null,
        row_data: updated,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    track("work_order_completed", auth.userId, { work_order_id: workOrder.id, property_id: workOrder.propertyId ?? "", category: body.category ?? "" });
    return NextResponse.json({ ok: true, workOrder: updated, expenseEntryIds });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
