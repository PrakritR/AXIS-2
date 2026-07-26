import type { SupabaseClient } from "@supabase/supabase-js";

import { upsertManagerCharges } from "@/lib/household-charges.server";
import type { HouseholdCharge } from "@/lib/household-charges";
import { chargePaymentReference } from "@/lib/manual-payment-instructions";
import { deliverPortalInboxMessage } from "@/lib/portal-inbox-delivery";
import type { ResidentReceiptContext } from "@/lib/payment-receipt-email/parse-receipt";
import {
  chargeAmountCents,
  matchChargeByContext,
} from "@/lib/payment-receipt-email/receipt-fallback-match";

export type MarkChargeFromReceiptResult =
  | { outcome: "idempotent"; sourceId: string }
  | { outcome: "marked_paid"; chargeId: string; channel: "venmo" | "zelle"; sourceId: string; matchedBy: "reference" | "context" }
  | { outcome: "no_match"; paymentReference: string; sourceId: string }
  | { outcome: "ambiguous"; paymentReference: string; matchCount: number; sourceId: string };

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

/**
 * Batched idempotency lookup: which of these source email ids are already
 * written onto a charge. One query per sync instead of one per message; a
 * failed lookup logs and returns empty (same fail-open behavior as the
 * per-message check — the amount/identity match is still required to credit).
 */
export async function loadProcessedReceiptSourceIds(
  db: SupabaseClient,
  field: "paidViaEmailReceiptId" | "paidViaGmailMessageId",
  sourceIds: string[],
): Promise<Set<string>> {
  if (sourceIds.length === 0) return new Set();
  const { data, error } = await db
    .from("portal_household_charge_records")
    .select(`source:row_data->>${field}`)
    .in(`row_data->>${field}`, sourceIds);
  if (error) {
    console.warn(`payment-receipt batched idempotency check failed (${field})`, error.message);
    return new Set();
  }
  return new Set(
    ((data ?? []) as { source: string | null }[])
      .map((row) => row.source)
      .filter((source): source is string => Boolean(source)),
  );
}

export async function loadPendingChargesForManager(
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
  receipt: ResidentReceiptContext,
  opts: {
    sourceId: string;
    sourceField: "paidViaEmailReceiptId" | "paidViaGmailMessageId";
    /**
     * Batched sync state: the caller already ran the idempotency lookup and
     * loaded pending charges once for the whole sync, so this call does zero
     * extra reads. The caller owns keeping `pendingCharges` current (drop a
     * charge after it is marked paid).
     */
    preloaded?: { alreadyProcessed: boolean; pendingCharges: HouseholdCharge[] };
  },
): Promise<MarkChargeFromReceiptResult> {
  const alreadyProcessed = opts.preloaded
    ? opts.preloaded.alreadyProcessed
    : await receiptSourceAlreadyProcessed(db, opts.sourceId, opts.sourceField);
  if (alreadyProcessed) {
    return { outcome: "idempotent", sourceId: opts.sourceId };
  }

  const referenceLabel = receipt.paymentReference ?? "(no reference)";
  const pending = opts.preloaded?.pendingCharges ?? (await loadPendingChargesForManager(db, managerUserId));

  let charge: HouseholdCharge;
  let matchedBy: "reference" | "context";

  if (receipt.paymentReference) {
    // Strong path: the resident typed the PL- code. Trust it exactly — never
    // fall through to fuzzy matching on a code that resolves to nothing (a typo
    // must not be silently re-attributed to some other charge).
    const reference = receipt.paymentReference;
    const matches = pending.filter((c) => {
      if (chargePaymentReference(c) !== reference) return false;
      const expected = chargeAmountCents(c);
      if (expected <= 0) return false;
      return Math.abs(expected - receipt.amountCents) <= 1;
    });
    if (matches.length === 0) {
      return { outcome: "no_match", sourceId: opts.sourceId, paymentReference: referenceLabel };
    }
    if (matches.length > 1) {
      return {
        outcome: "ambiguous",
        sourceId: opts.sourceId,
        paymentReference: referenceLabel,
        matchCount: matches.length,
      };
    }
    charge = matches[0]!;
    matchedBy = "reference";
  } else {
    // Fallback path: no reference code. Match on amount + payer identity +
    // property/unit context, biasing to `ambiguous` so a weak match is surfaced
    // for the manager rather than auto-credited.
    const result = matchChargeByContext(pending, {
      amountCents: receipt.amountCents,
      payerName: receipt.payerName,
      memoText: receipt.memoText,
    });
    if (result.kind === "none") {
      return { outcome: "no_match", sourceId: opts.sourceId, paymentReference: referenceLabel };
    }
    if (result.kind === "ambiguous") {
      return {
        outcome: "ambiguous",
        sourceId: opts.sourceId,
        paymentReference: referenceLabel,
        matchCount: result.matchCount,
      };
    }
    charge = result.charge;
    matchedBy = "context";
  }

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
    matchedBy,
  };
}
