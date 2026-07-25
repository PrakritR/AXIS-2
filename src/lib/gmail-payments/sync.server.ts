import type { SupabaseClient } from "@supabase/supabase-js";

import { loadManagerManualPaymentSettings } from "@/lib/manager-manual-payment-settings";
import { parsePaymentReceiptEmail } from "@/lib/payment-receipt-email/parse-receipt";
import { markChargePaidFromReceipt } from "@/lib/payment-receipt-email/mark-charge-from-receipt.server";

import { ensureGmailPaymentsAccessToken, listPaymentReceiptMessages } from "./api.server";
import { buildPaymentReceiptGmailQuery } from "./gmail-query";
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
  managerUserId: string,
): Promise<GmailPaymentsSyncResult> {
  const settings = await loadManagerManualPaymentSettings(db, managerUserId);
  if (settings.receiptAutoMarkEnabled === false) {
    return { scanned: 0, markedPaid: 0, unmatched: 0, ambiguous: 0, idempotent: 0, errors: ["auto_mark_disabled"] };
  }

  const { accessToken } = await ensureGmailPaymentsAccessToken(db, managerUserId);
  const query = buildPaymentReceiptGmailQuery(30);
  const messages = await listPaymentReceiptMessages(accessToken, query, 40);

  const result: GmailPaymentsSyncResult = {
    scanned: messages.length,
    markedPaid: 0,
    unmatched: 0,
    ambiguous: 0,
    idempotent: 0,
    errors: [],
  };

  for (const msg of messages) {
    const receipt = parsePaymentReceiptEmail({
      fromEmail: msg.fromEmail,
      subject: msg.subject,
      body: msg.body,
    });
    if (!receipt) continue;

    try {
      const outcome = await markChargePaidFromReceipt(db, managerUserId, receipt, {
        sourceId: msg.id,
        sourceField: "paidViaGmailMessageId",
      });
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

  await saveGmailPaymentsConnection(db, managerUserId, {
    lastSyncAt: new Date().toISOString(),
    lastSyncMarkedPaid: result.markedPaid,
  });

  return result;
}
