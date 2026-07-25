import type { SupabaseClient } from "@supabase/supabase-js";

import { upsertManagerCharges } from "@/lib/household-charges.server";
import type { HouseholdCharge } from "@/lib/household-charges";
import { chargePaymentReference } from "@/lib/manual-payment-instructions";
import { parseMoneyAmount } from "@/lib/parse-money";
import { deliverPortalInboxMessage } from "@/lib/portal-inbox-delivery";
import type { ParsedPaymentReceipt } from "@/lib/payment-receipt-email/parse-receipt";

export type MarkChargeFromReceiptResult =
  | { outcome: "idempotent"; sourceId: string }
  | { outcome: "marked_paid"; chargeId: string; channel: "venmo" | "zelle"; sourceId: string }
  | { outcome: "no_match"; paymentReference: string; sourceId: string }
  | { outcome: "ambiguous"; paymentReference: string; matchCount: number; sourceId: string };

function chargeAmountCents(charge: HouseholdCharge): number {
  const label = charge.balanceLabel?.trim() || charge.amountLabel?.trim() || "";
  return Math.round(parseMoneyAmount(label) * 100);
}

async function receiptSourceAlreadyProcessed(
  db: SupabaseClient,
  sourceId: string,
  field: "paidViaEmailReceiptId" | "paidViaGmailMessageId",
): Promise<boolean> {
  const { data, error } = await db
    .from("portal_household_charge_records")
    .select("id")
    .eq(`row_data->>${field}`, sourceId)
    .limit(1);
  if (error) {
    console.warn(`payment-receipt idempotency check failed (${field})`, sourceId, error.message);
    return false;
  }
  return (data ?? []).length > 0;
}

async function loadPendingChargesForManager(
  db: SupabaseClient,
  managerUserId: string,
): Promise<HouseholdCharge[]> {
  const { data, error } = await db
    .from("portal_household_charge_records")
    .select("id, row_data, status")
    .eq("manager_user_id", managerUserId)
    .in("status", ["pending", "failed", "partially_paid"]);
  if (error) throw new Error(error.message);
  return (data ?? [])
    .map((row) => {
      const charge = row.row_data as HouseholdCharge | null;
      if (!charge?.id) return null;
      return { ...charge, id: String(charge.id ?? row.id) };
    })
    .filter(Boolean) as HouseholdCharge[];
}

export async function markChargePaidFromReceipt(
  db: SupabaseClient,
  managerUserId: string,
  receipt: ParsedPaymentReceipt,
  opts: {
    sourceId: string;
    sourceField: "paidViaEmailReceiptId" | "paidViaGmailMessageId";
  },
): Promise<MarkChargeFromReceiptResult> {
  if (await receiptSourceAlreadyProcessed(db, opts.sourceId, opts.sourceField)) {
    return { outcome: "idempotent", sourceId: opts.sourceId };
  }

  const pending = await loadPendingChargesForManager(db, managerUserId);
  const matches = pending.filter((charge) => {
    if (chargePaymentReference(charge) !== receipt.paymentReference) return false;
    const expected = chargeAmountCents(charge);
    if (expected <= 0) return false;
    return Math.abs(expected - receipt.amountCents) <= 1;
  });

  if (matches.length === 0) {
    return {
      outcome: "no_match",
      sourceId: opts.sourceId,
      paymentReference: receipt.paymentReference,
    };
  }
  if (matches.length > 1) {
    return {
      outcome: "ambiguous",
      sourceId: opts.sourceId,
      paymentReference: receipt.paymentReference,
      matchCount: matches.length,
    };
  }

  const charge = matches[0]!;
  const now = new Date().toISOString();
  const merged: HouseholdCharge = {
    ...charge,
    status: "paid",
    paidAt: now,
    balanceLabel: "$0.00",
    manualPaymentChannel: receipt.channel,
    [opts.sourceField]: opts.sourceId,
  };

  await upsertManagerCharges(db, managerUserId, [merged]);

  const residentEmail = charge.residentEmail?.trim().toLowerCase();
  const residentUserId = charge.residentUserId?.trim() || null;
  if (residentUserId || residentEmail) {
    const channelLabel = receipt.channel === "venmo" ? "Venmo" : "Zelle";
    await deliverPortalInboxMessage(db, {
      senderUserId: managerUserId,
      senderEmail: "payments@prop-lane.space",
      fromName: "PropPlane Payments",
      subject: `Payment received: ${charge.title}`,
      text: [
        `Your ${channelLabel} payment for "${charge.title}" was received and marked paid.`,
        `Amount: ${charge.balanceLabel?.trim() || charge.amountLabel?.trim() || ""}`,
        `Reference: ${chargePaymentReference(charge)}`,
        "",
        "Thank you!",
      ].join("\n"),
      toUserIds: residentUserId ? [residentUserId] : [],
      deliverToPortalInbox: true,
      deliverViaEmail: false,
      deliverViaSms: false,
    }).catch(() => undefined);
  }

  return {
    outcome: "marked_paid",
    sourceId: opts.sourceId,
    chargeId: charge.id,
    channel: receipt.channel,
  };
}
