import type { SupabaseClient } from "@supabase/supabase-js";

import { loadManagerManualPaymentSettings } from "@/lib/manager-manual-payment-settings";
import { markChargePaidFromReceipt } from "@/lib/payment-receipt-email/mark-charge-from-receipt.server";
import { markWorkOrderPaidFromVendorReceipt } from "@/lib/payment-receipt-email/mark-work-order-from-receipt.server";
import {
  parseResidentReceiptContext,
  parseWorkOrderPaymentReceiptEmail,
} from "@/lib/payment-receipt-email/parse-receipt";

import { ensureGmailPaymentsAccessToken, listPaymentReceiptMessages } from "./api.server";
import { buildPaymentReceiptGmailQuery } from "./gmail-query";
import type { GmailPaymentTrackRole } from "./portal-role";
import { saveGmailPaymentsConnection } from "./settings";

export type GmailPaymentsSyncResult = {
  scanned: number;
  markedPaid: number;
  unmatched: number;
  ambiguous: number;
  idempotent: number;
  errors: string[];
};

export async function syncGmailPaymentReceipts(
  db: SupabaseClient,
  userId: string,
  role: GmailPaymentTrackRole,
): Promise<GmailPaymentsSyncResult> {
  if (role === "manager") {
    const settings = await loadManagerManualPaymentSettings(db, userId);
    if (settings.receiptAutoMarkEnabled === false) {
      return { scanned: 0, markedPaid: 0, unmatched: 0, ambiguous: 0, idempotent: 0, errors: ["auto_mark_disabled"] };
    }
  }

  const { accessToken } = await ensureGmailPaymentsAccessToken(db, userId, role);
  const messages = await listPaymentReceiptMessages(accessToken, buildPaymentReceiptGmailQuery(30), 40);

  const result: GmailPaymentsSyncResult = {
    scanned: messages.length,
    markedPaid: 0,
    unmatched: 0,
    ambiguous: 0,
    idempotent: 0,
    errors: [],
  };

  for (const msg of messages) {
    const email = { fromEmail: msg.fromEmail, subject: msg.subject, body: msg.body };
    try {
      let outcome: { outcome: "marked_paid" | "no_match" | "ambiguous" | "idempotent" } | null = null;
      if (role === "manager") {
        const receipt = parseResidentReceiptContext(email);
        if (!receipt) continue;
        outcome = await markChargePaidFromReceipt(db, userId, receipt, {
          sourceId: msg.id,
          sourceField: "paidViaGmailMessageId",
        });
      } else {
        const receipt = parseWorkOrderPaymentReceiptEmail(email);
        if (!receipt) continue;
        outcome = await markWorkOrderPaidFromVendorReceipt(db, userId, receipt, msg.id);
      }

      switch (outcome.outcome) {
        case "marked_paid":
          result.markedPaid += 1;
          break;
        case "no_match":
          result.unmatched += 1;
          break;
        case "ambiguous":
          result.ambiguous += 1;
          break;
        case "idempotent":
          result.idempotent += 1;
          break;
      }
    } catch (e) {
      result.errors.push(e instanceof Error ? e.message : "sync error");
    }
  }

  await saveGmailPaymentsConnection(db, userId, role, {
    lastSyncAt: new Date().toISOString(),
    lastSyncMarkedPaid: result.markedPaid,
  });

  return result;
}
