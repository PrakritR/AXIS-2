import type { SupabaseClient } from "@supabase/supabase-js";

import type { ParsedInboundEmail } from "@/lib/inbound-email/inbound-email.server";
import { resolveInboundEmailBody } from "@/lib/inbound-email/inbound-email.server";
import { loadManagerManualPaymentSettings } from "@/lib/manager-manual-payment-settings";

import { extractPaymentInboxToken, resolveManagerIdByPaymentInboxToken } from "./payment-inbox";
import { parsePaymentReceiptEmail } from "./parse-receipt";
import { markChargePaidFromReceipt } from "./mark-charge-from-receipt.server";

export type ProcessPaymentReceiptResult =
  | { outcome: "ignored"; reason: string }
  | { outcome: "idempotent"; emailId: string }
  | { outcome: "marked_paid"; emailId: string; chargeId: string; channel: "venmo" | "zelle" }
  | { outcome: "no_match"; emailId: string; paymentReference: string }
  | { outcome: "ambiguous"; emailId: string; paymentReference: string; matchCount: number };

export async function processInboundPaymentReceiptEmail(
  parsed: ParsedInboundEmail,
  db: SupabaseClient,
): Promise<ProcessPaymentReceiptResult> {
  const token = extractPaymentInboxToken(parsed.toEmails);
  if (!token) return { outcome: "ignored", reason: "not_payment_inbox" };

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

  const result = await markChargePaidFromReceipt(db, managerUserId, receipt, {
    sourceId: parsed.emailId,
    sourceField: "paidViaEmailReceiptId",
  });

  switch (result.outcome) {
    case "idempotent":
      return { outcome: "idempotent", emailId: parsed.emailId };
    case "no_match":
      return { outcome: "no_match", emailId: parsed.emailId, paymentReference: result.paymentReference };
    case "ambiguous":
      return {
        outcome: "ambiguous",
        emailId: parsed.emailId,
        paymentReference: result.paymentReference,
        matchCount: result.matchCount,
      };
    case "marked_paid":
      return {
        outcome: "marked_paid",
        emailId: parsed.emailId,
        chargeId: result.chargeId,
        channel: result.channel,
      };
  }
}
