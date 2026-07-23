import { NextResponse } from "next/server";
import { track } from "@/lib/analytics/posthog";
import type { DemoManagerWorkOrderRow } from "@/data/demo-portal";
import { deliverPortalInboxMessage } from "@/lib/portal-inbox-delivery";
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
      /** When true, the client sends the resident notice (editable email + SMS). */
      skipResidentNotify?: boolean;
    };

    const workOrder = body.workOrder;
    if (!workOrder?.id) return NextResponse.json({ error: "workOrder required." }, { status: 400 });
    if (!body.category) return NextResponse.json({ error: "category required." }, { status: 400 });

    const { data: existing } = await auth.db
      .from("portal_work_order_records")
      .select("row_data")
      .eq("id", workOrder.id)
      .maybeSingle();
    const existingRow = (existing?.row_data ?? {}) as DemoManagerWorkOrderRow;
    const alreadyCompleted = Boolean(existingRow.completedAt);

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

    if (!alreadyCompleted && !body.skipResidentNotify) {
      const propertyLabel = updated.propertyName ? `${updated.propertyName}${updated.unit ? ` · ${updated.unit}` : ""}` : "";
      const title = updated.title || "Work order";
      const residentEmail = (updated.residentEmail ?? "").trim();
      if (residentEmail.includes("@")) {
        await deliverPortalInboxMessage(auth.db, {
          senderUserId: auth.userId,
          senderEmail: auth.email,
          fromName: "PropLane Portal",
          subject: `${title} completed`,
          text: `Your work order "${title}"${propertyLabel ? ` at ${propertyLabel}` : ""} has been completed.`,
          toEmails: [residentEmail],
          deliverToPortalInbox: true,
          deliverViaEmail: false,
          deliverViaSms: false,
        }).catch(() => undefined);
        track("work_order_resident_notified", auth.userId, { stage: "completed", work_order_id: workOrder.id });
      }
    }

    track("work_order_completed", auth.userId, { work_order_id: workOrder.id, property_id: workOrder.propertyId ?? "", category: body.category ?? "" });
    return NextResponse.json({ ok: true, workOrder: updated, expenseEntryIds });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
