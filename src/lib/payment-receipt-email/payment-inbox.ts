import { randomBytes } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  loadManagerManualPaymentSettings,
  saveManagerManualPaymentSettings,
  type ManagerManualPaymentSettings,
} from "@/lib/manager-manual-payment-settings";

const PAYMENT_INBOX_LOCAL_PART = "payments";
const TOKEN_PATTERN = /^[a-zA-Z0-9_-]{8,24}$/;

export function paymentsInboundDomain(): string {
  return (
    process.env.PAYMENTS_INBOUND_DOMAIN?.trim() ||
    process.env.INBOUND_EMAIL_DOMAIN?.trim() ||
    "prop-lane.space"
  );
}

export function generatePaymentInboxToken(): string {
  return randomBytes(9).toString("base64url").slice(0, 12);
}

export function paymentInboxAddress(token: string): string {
  return `${PAYMENT_INBOX_LOCAL_PART}+${token}@${paymentsInboundDomain()}`;
}

/** Extract inbox token from `payments+<token>@…` in any To/Cc address. */
export function extractPaymentInboxToken(addresses: string[]): string | null {
  for (const raw of addresses) {
    const email = raw.trim().toLowerCase();
    const at = email.lastIndexOf("@");
    if (at <= 0) continue;
    const local = email.slice(0, at);
    const plus = local.indexOf("+");
    if (plus === -1) continue;
    const prefix = local.slice(0, plus);
    if (prefix !== PAYMENT_INBOX_LOCAL_PART) continue;
    const token = local.slice(plus + 1);
    if (TOKEN_PATTERN.test(token)) return token;
  }
  return null;
}

export function isPaymentInboxEmail(addresses: string[]): boolean {
  return extractPaymentInboxToken(addresses) !== null;
}

async function resolveManagerIdFromRowDataToken(
  db: SupabaseClient,
  token: string,
): Promise<string | null> {
  const { data, error } = await db
    .from("manager_automation_settings")
    .select("manager_user_id, row_data")
    .filter("row_data->manualPayments->>paymentInboxToken", "eq", token)
    .maybeSingle();
  if (error) {
    console.warn("payment-inbox row_data token lookup failed", error.message);
    return null;
  }
  return typeof data?.manager_user_id === "string" ? data.manager_user_id : null;
}

export async function resolveManagerIdByPaymentInboxToken(
  db: SupabaseClient,
  token: string,
): Promise<string | null> {
  if (!TOKEN_PATTERN.test(token)) return null;

  const { data, error } = await db
    .from("manager_automation_settings")
    .select("manager_user_id")
    .eq("manual_payments->>paymentInboxToken", token)
    .maybeSingle();
  if (!error && data?.manager_user_id) {
    return String(data.manager_user_id);
  }
  if (error && !error.message.toLowerCase().includes("manual_payments")) {
    console.warn("payment-inbox column token lookup failed", error.message);
  }
  return resolveManagerIdFromRowDataToken(db, token);
}

export async function ensureManagerPaymentInbox(
  db: SupabaseClient,
  managerUserId: string,
): Promise<ManagerManualPaymentSettings & { paymentInboxAddress: string }> {
  const current = await loadManagerManualPaymentSettings(db, managerUserId);
  const token =
    current.paymentInboxToken && TOKEN_PATTERN.test(current.paymentInboxToken)
      ? current.paymentInboxToken
      : generatePaymentInboxToken();
  const next: ManagerManualPaymentSettings = {
    ...current,
    paymentInboxToken: token,
    receiptAutoMarkEnabled: current.receiptAutoMarkEnabled !== false,
  };
  const saved =
    token === current.paymentInboxToken && current.receiptAutoMarkEnabled === next.receiptAutoMarkEnabled
      ? current
      : await saveManagerManualPaymentSettings(db, managerUserId, next);
  const resolvedToken = saved.paymentInboxToken ?? token;
  return {
    ...saved,
    paymentInboxToken: resolvedToken,
    paymentInboxAddress: paymentInboxAddress(resolvedToken),
  };
}
