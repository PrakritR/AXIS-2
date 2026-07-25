import type { SupabaseClient } from "@supabase/supabase-js";

import type { DemoManagerWorkOrderRow } from "@/data/demo-portal";
import { generateWorkOrderPaymentReference } from "@/lib/payment-reference";
import type { ParsedPaymentReceipt } from "@/lib/payment-receipt-email/parse-receipt";
import { parseMoneyAmount } from "@/lib/parse-money";
import { markWorkOrderPaid } from "@/lib/work-order-expenses";

export type MarkWorkOrderFromReceiptResult =
  | { outcome: "idempotent"; sourceId: string }
  | { outcome: "marked_paid"; workOrderId: string; channel: "venmo" | "zelle"; sourceId: string }
  | { outcome: "no_match"; paymentReference: string; sourceId: string }
  | { outcome: "ambiguous"; paymentReference: string; matchCount: number; sourceId: string };

function workOrderAmountCents(row: DemoManagerWorkOrderRow): number {
  const labor = row.vendorCostCents ?? 0;
  const materials = row.materialsCostCents ?? 0;
  if (labor + materials > 0) return labor + materials;
  const parsed = parseMoneyAmount(row.cost ?? "");
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) : 0;
}

function workOrderPaymentReference(row: DemoManagerWorkOrderRow): string {
  return row.paymentReference?.trim() || generateWorkOrderPaymentReference(row.id);
}

async function gmailReceiptAlreadyApplied(db: SupabaseClient, sourceId: string): Promise<boolean> {
  const { data, error } = await db
    .from("portal_work_order_records")
    .select("id")
    .eq("row_data->>paidViaGmailMessageId", sourceId)
    .limit(1);
  if (error) return false;
  return (data ?? []).length > 0;
}

async function loadPayableWorkOrdersForVendor(
  db: SupabaseClient,
  vendorUserId: string,
): Promise<DemoManagerWorkOrderRow[]> {
  const { data, error } = await db
    .from("portal_work_order_records")
    .select("id, row_data, vendor_user_id")
    .eq("vendor_user_id", vendorUserId);
  if (error) throw new Error(error.message);

  return (data ?? [])
    .map((row) => {
      const wo = row.row_data as DemoManagerWorkOrderRow | null;
      if (!wo?.id) return null;
      return { ...wo, id: String(wo.id ?? row.id) };
    })
    .filter((wo): wo is DemoManagerWorkOrderRow => {
      if (!wo) return false;
      if (wo.automationStatus === "paid") return false;
      return wo.automationStatus === "vendor_marked_done" || wo.bucket === "completed";
    });
}

export async function markWorkOrderPaidFromVendorReceipt(
  db: SupabaseClient,
  vendorUserId: string,
  receipt: ParsedPaymentReceipt,
  sourceId: string,
): Promise<MarkWorkOrderFromReceiptResult> {
  if (receipt.referenceKind !== "work_order") {
    return { outcome: "no_match", sourceId, paymentReference: receipt.paymentReference };
  }

  if (await gmailReceiptAlreadyApplied(db, sourceId)) {
    return { outcome: "idempotent", sourceId };
  }

  const pending = await loadPayableWorkOrdersForVendor(db, vendorUserId);
  const matches = pending.filter((wo) => {
    if (workOrderPaymentReference(wo) !== receipt.paymentReference) return false;
    const expected = workOrderAmountCents(wo);
    if (expected <= 0) return false;
    return Math.abs(expected - receipt.amountCents) <= 1;
  });

  if (matches.length === 0) {
    return { outcome: "no_match", sourceId, paymentReference: receipt.paymentReference };
  }
  if (matches.length > 1) {
    return {
      outcome: "ambiguous",
      sourceId,
      paymentReference: receipt.paymentReference,
      matchCount: matches.length,
    };
  }

  const workOrder = matches[0]!;
  const paid = markWorkOrderPaid(workOrder, new Date().toISOString(), { channel: receipt.channel });
  const merged: DemoManagerWorkOrderRow = { ...paid, paidViaGmailMessageId: sourceId };

  const { error } = await db
    .from("portal_work_order_records")
    .update({ row_data: merged })
    .eq("id", workOrder.id)
    .eq("vendor_user_id", vendorUserId);
  if (error) throw new Error(error.message);

  return {
    outcome: "marked_paid",
    sourceId,
    workOrderId: workOrder.id,
    channel: receipt.channel,
  };
}
