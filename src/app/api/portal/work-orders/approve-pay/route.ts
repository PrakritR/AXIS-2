import { NextResponse } from "next/server";
import { track } from "@/lib/analytics/posthog";
import type { DemoManagerWorkOrderRow } from "@/data/demo-portal";
import { autoFileWorkOrderReceipt } from "@/lib/documents/document-auto-file-hooks.server";
import { notifyWorkOrderEvent } from "@/lib/work-order-notification.server";
import { assertManagerFinancialsAccess, getReportsAuthContext } from "@/lib/reports/auth";
import type { WorkOrderCategory } from "@/lib/reports/categories";
import { createExpensesFromWorkOrder, markWorkOrderPaid, mergeWorkOrderCompletion } from "@/lib/work-order-expenses";
import { payoutVendorForWorkOrder } from "@/lib/stripe-vendor-payout";

export const runtime = "nodejs";

/** Manager's one-tap (or confirm-preview, for larger amounts — gated client-side) "Approve
 * + Pay": runs the same completion + expense-logging as /work-orders/complete, marks the
 * vendor paid, and (best-effort) transfers the vendor's labor cost to their connected Stripe
 * account if they've finished Connect onboarding — see payoutVendorForWorkOrder. Notifies the
 * resident and vendor. */
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

    const workOrder = body.workOrder;
    if (!workOrder?.id) return NextResponse.json({ error: "workOrder required." }, { status: 400 });
    if (!body.category) return NextResponse.json({ error: "category required." }, { status: 400 });

    const { data: existing } = await auth.db
      .from("portal_work_order_records")
      .select("manager_user_id, vendor_user_id, row_data")
      .eq("id", workOrder.id)
      .maybeSingle();
    if (!existing || (auth.role !== "admin" && existing.manager_user_id !== auth.userId)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
    const existingRow = (existing.row_data ?? {}) as DemoManagerWorkOrderRow;

    const ownerManagerUserId = String(existing.manager_user_id ?? auth.userId);
    const { data: acceptedBid } = await auth.db
      .from("work_order_bids")
      .select("amount_cents, materials_cents, vendor_directory_id")
      .eq("work_order_id", workOrder.id)
      .eq("status", "accepted")
      .maybeSingle();
    const bidVendorCostCents = acceptedBid?.amount_cents == null ? NaN : Number(acceptedBid.amount_cents);
    const bidMaterialsCostCents = acceptedBid?.materials_cents == null ? 0 : Number(acceptedBid.materials_cents);
    const acceptedVendorCostCents =
      Number.isFinite(bidVendorCostCents) ? bidVendorCostCents : body.vendorCostCents;
    const acceptedMaterialsCostCents =
      Number.isFinite(bidMaterialsCostCents) ? bidMaterialsCostCents : body.materialsCostCents;
    const acceptedVendorId =
      typeof acceptedBid?.vendor_directory_id === "string" && acceptedBid.vendor_directory_id.trim()
        ? acceptedBid.vendor_directory_id
        : existingRow.vendorId;

    const paymentChannel = body.paymentChannel === "zelle" || body.paymentChannel === "venmo" || body.paymentChannel === "ach"
      ? body.paymentChannel
      : "ach";

    const { data: vendorDirectory } = acceptedVendorId
      ? await auth.db
          .from("manager_vendor_records")
          .select("row_data")
          .eq("id", acceptedVendorId)
          .eq("manager_user_id", ownerManagerUserId)
          .maybeSingle()
      : { data: null };
    const vendorRow = (vendorDirectory?.row_data ?? null) as {
      zelleContact?: string;
      venmoContact?: string;
      zellePaymentsEnabled?: boolean;
      venmoPaymentsEnabled?: boolean;
    } | null;

    const expenseEntryIds = await createExpensesFromWorkOrder(auth.db, ownerManagerUserId, {
      workOrderId: workOrder.id,
      category: body.category,
      vendorCostCents: acceptedVendorCostCents,
      materialsCostCents: acceptedMaterialsCostCents,
      materialsMemo: body.materialsMemo,
      workDoneSummary: body.workDoneSummary,
      propertyId: workOrder.propertyId || workOrder.assignedPropertyId,
      vendorId: acceptedVendorId,
    });

    const completed = mergeWorkOrderCompletion(
      { ...existingRow, ...workOrder },
      {
        workOrderId: workOrder.id,
        category: body.category,
        vendorCostCents: acceptedVendorCostCents,
        materialsCostCents: acceptedMaterialsCostCents,
        materialsMemo: body.materialsMemo,
        workDoneSummary: body.workDoneSummary,
        propertyId: workOrder.propertyId,
        vendorId: acceptedVendorId,
      },
      expenseEntryIds,
    );
    const paid = markWorkOrderPaid(completed, new Date().toISOString(), {
      channel: paymentChannel,
      zelleContactSnapshot:
        paymentChannel === "zelle" && vendorRow?.zellePaymentsEnabled ? vendorRow.zelleContact?.trim() : undefined,
      venmoContactSnapshot:
        paymentChannel === "venmo" && vendorRow?.venmoPaymentsEnabled ? vendorRow.venmoContact?.trim() : undefined,
    });

    const { error } = await auth.db.from("portal_work_order_records").upsert(
      {
        id: workOrder.id,
        manager_user_id: ownerManagerUserId,
        property_id: workOrder.propertyId ?? null,
        resident_email: workOrder.residentEmail ?? null,
        row_data: paid,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (existing.vendor_user_id && paymentChannel === "ach") {
      // amountCents here is only a fallback for jobs assigned without formal bidding —
      // payoutVendorForWorkOrder anchors to the work order's accepted bid when one exists,
      // so a forged body.vendorCostCents can't inflate a payout beyond the agreed bid.
      await payoutVendorForWorkOrder(auth.db, {
        workOrderId: workOrder.id,
        managerUserId: ownerManagerUserId,
        vendorUserId: existing.vendor_user_id,
        amountCents: acceptedVendorCostCents ?? 0,
      }).catch(() => undefined);
    }

    const propertyLabel = paid.propertyName ? `${paid.propertyName}${paid.unit ? ` · ${paid.unit}` : ""}` : "";
    const title = paid.title || "Work order";
    const residentEmail = (paid.residentEmail ?? "").trim();
    if (residentEmail.includes("@")) {
      await notifyWorkOrderEvent(auth.db, {
        event: "completed",
        senderUserId: auth.userId,
        senderEmail: auth.email,
        subject: `${title} completed`,
        text: `Your work order "${title}"${propertyLabel ? ` at ${propertyLabel}` : ""} has been completed.`,
        title,
        propertyLabel,
        toEmails: [residentEmail],
      });
    }
    if (existing.vendor_user_id) {
      await notifyWorkOrderEvent(auth.db, {
        event: "approved_paid",
        senderUserId: auth.userId,
        senderEmail: auth.email,
        subject: `${title} approved and paid`,
        text: `"${title}"${propertyLabel ? ` at ${propertyLabel}` : ""} has been approved and marked paid. Thanks for the work.`,
        title,
        propertyLabel,
        toUserIds: [existing.vendor_user_id],
      });
    }

    await autoFileWorkOrderReceipt(auth.db, {
      managerUserId: ownerManagerUserId,
      workOrderId: workOrder.id,
      title,
      propertyLabel,
      propertyId: workOrder.propertyId || workOrder.assignedPropertyId,
      vendorId: acceptedVendorId,
      vendorName: existingRow.vendorName,
      vendorCostCents: acceptedVendorCostCents,
      materialsCostCents: acceptedMaterialsCostCents,
      workDoneSummary: body.workDoneSummary,
      paidAtIso: paid.paidAt,
      paymentChannel,
    }).catch(() => undefined);

    // Mirror a payment receipt into the document library (no-op unless the
    // manager opted the "invoice" auto-file category in). Best-effort.
    await autoFileWorkOrderReceipt(auth.db, {
      managerUserId: ownerManagerUserId,
      workOrderId: workOrder.id,
      title: paid.title,
      propertyLabel,
      propertyId: workOrder.propertyId ?? null,
      vendorId: acceptedVendorId ?? null,
      vendorCostCents: acceptedVendorCostCents ?? 0,
      materialsCostCents: acceptedMaterialsCostCents ?? 0,
      workDoneSummary: body.workDoneSummary ?? null,
      paidAtIso: new Date().toISOString(),
      paymentChannel,
    }).catch(() => undefined);

    track("work_order_completed", auth.userId, {
      work_order_id: workOrder.id,
      property_id: workOrder.propertyId ?? "",
      category: body.category ?? "",
    });
    track("work_order_paid", auth.userId, { work_order_id: workOrder.id, property_id: workOrder.propertyId ?? "" });
    return NextResponse.json({ ok: true, workOrder: paid, expenseEntryIds });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
