import type { SupabaseClient } from "@supabase/supabase-js";

import type { ParsedInboundEmail } from "@/lib/inbound-email/inbound-email.server";
import { resolveInboundEmailBody } from "@/lib/inbound-email/inbound-email.server";
import { upsertManagerCharges } from "@/lib/household-charges.server";
import type { HouseholdCharge } from "@/lib/household-charges";
import { loadManagerManualPaymentSettings } from "@/lib/manager-manual-payment-settings";
import { parseMoneyAmount } from "@/lib/parse-money";
import { generatePaymentReference } from "@/lib/payment-reference";

import { extractPaymentInboxToken, resolveManagerIdByPaymentInboxToken } from "./payment-inbox";
import { parsePaymentReceiptEmail } from "./parse-receipt";

export type ProcessPaymentReceiptResult =
  | { outcome: "ignored"; reason: string }
  | { outcome: "idempotent"; emailId: string }
  | { outcome: "marked_paid"; emailId: string; chargeId: string; channel: "venmo" | "zelle" }
  | { outcome: "no_match"; emailId: string; paymentReference: string }
  | { outcome: "ambiguous"; emailId: string; paymentReference: string; matchCount: number };

function chargeAmountCents(charge: HouseholdCharge): number {
  const label = charge.balanceLabel?.trim() || charge.amountLabel?.trim() || "";
  return Math.round(parseMoneyAmount(label) * 100);
}

function chargePaymentReference(charge: HouseholdCharge): string {
  return charge.paymentReference?.trim() || generatePaymentReference(charge.id);
}

async function receiptAlreadyProcessed(
  db: SupabaseClient,
  emailId: string,
): Promise<boolean> {
  const { data, error } = await db
    .from("portal_household_charge_records")
    .select("id")
    .eq("row_data->>paidViaEmailReceiptId", emailId)
    .limit(1);
  if (error) {
    console.warn("payment-receipt idempotency check failed", emailId, error.message);
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

export async function processInboundPaymentReceiptEmail(
  parsed: ParsedInboundEmail,
  db: SupabaseClient,
): Promise<ProcessPaymentReceiptResult> {
  const token = extractPaymentInboxToken(parsed.toEmails);
  if (!token) return { outcome: "ignored", reason: "not_payment_inbox" };

  if (await receiptAlreadyProcessed(db, parsed.emailId)) {
    return { outcome: "idempotent", emailId: parsed.emailId };
  }

  const managerUserId = await resolveManagerIdByPaymentInboxToken(db, token);
  if (!managerUserId) return { outcome: "ignored", reason: "unknown_inbox_token" };

  const settings = await loadManagerManualPaymentSettings(db, managerUserId);
  if (settings.receiptAutoMarkEnabled === false) {
    return { outcome: "ignored", reason: "receipt_auto_mark_disabled" };
  }

  const body = await resolveInboundEmailBody(parsed);
  const receipt = parsePaymentReceiptEmail({
    fromEmail: parsed.fromEmail,
    subject: parsed.subject,
    body,
  });
  if (!receipt) return { outcome: "ignored", reason: "unparseable_receipt" };

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
      emailId: parsed.emailId,
      paymentReference: receipt.paymentReference,
    };
  }
  if (matches.length > 1) {
    return {
      outcome: "ambiguous",
      emailId: parsed.emailId,
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
    paidViaEmailReceiptId: parsed.emailId,
  };

  await upsertManagerCharges(db, managerUserId, [merged]);

  return {
    outcome: "marked_paid",
    emailId: parsed.emailId,
    chargeId: charge.id,
    channel: receipt.channel,
  };
}
