import type { SupabaseClient } from "@supabase/supabase-js";

import { loadManagerManualPaymentSettings } from "@/lib/manager-manual-payment-settings";
import {
  loadPendingChargesForManager,
  loadProcessedReceiptSourceIds,
  markChargePaidFromReceipt,
} from "@/lib/payment-receipt-email/mark-charge-from-receipt.server";
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

  const tally = (outcome: "marked_paid" | "no_match" | "ambiguous" | "idempotent") => {
    switch (outcome) {
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
  };

  if (role === "manager") {
    const candidates = messages.flatMap((msg) => {
      const receipt = parseResidentReceiptContext({ fromEmail: msg.fromEmail, subject: msg.subject, body: msg.body });
      return receipt ? [{ msg, receipt }] : [];
    });
    if (candidates.length > 0) {
      try {
        const processedIds = await loadProcessedReceiptSourceIds(
          db,
          "paidViaGmailMessageId",
          candidates.map((c) => c.msg.id),
        );
        let pending = await loadPendingChargesForManager(db, userId);
        for (const { msg, receipt } of candidates) {
          try {
            const outcome = await markChargePaidFromReceipt(db, userId, receipt, {
              sourceId: msg.id,
              sourceField: "paidViaGmailMessageId",
              preloaded: { alreadyProcessed: processedIds.has(msg.id), pendingCharges: pending },
            });
            if (outcome.outcome === "marked_paid") {
              pending = pending.filter((c) => c.id !== outcome.chargeId);
            }
            tally(outcome.outcome);
          } catch (e) {
            result.errors.push(e instanceof Error ? e.message : "sync error");
          }
        }
      } catch (e) {
        result.errors.push(e instanceof Error ? e.message : "sync error");
      }
    }
  } else {
    for (const msg of messages) {
      try {
        const receipt = parseWorkOrderPaymentReceiptEmail({
          fromEmail: msg.fromEmail,
          subject: msg.subject,
          body: msg.body,
        });
        if (!receipt) continue;
        const outcome = await markWorkOrderPaidFromVendorReceipt(db, userId, receipt, msg.id);
        tally(outcome.outcome);
      } catch (e) {
        result.errors.push(e instanceof Error ? e.message : "sync error");
      }
    }
  }

  await saveGmailPaymentsConnection(db, userId, role, {
    lastSyncAt: new Date().toISOString(),
    lastSyncMarkedPaid: result.markedPaid,
  });

  return result;
}
