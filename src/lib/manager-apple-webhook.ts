import { tierForAppleProductId } from "@/lib/manager-apple-purchase";
import type { PaidTier, StripeBilling } from "@/lib/stripe-price-ids";

/**
 * Pure interpreters for RevenueCat's Apple-backed lifecycle — shared by the
 * webhook route (real-time invalidation) and the reconciler (authoritative
 * re-fetch). No I/O, no server-only imports, so they are fully unit-testable.
 *
 * Safety discipline mirrors the Stripe reconciler (`isDefinitiveStripeSubscription
 * MissingError`): access is only revoked on a DEFINITIVE expiry/refund signal,
 * never on ambiguity. A cancellation (auto-renew off) keeps access until the
 * period actually ends; a billing-grace event keeps access while Apple retries.
 * See report §3.2 and docs/agents/apple-iap.md.
 */

/** Subset of a RevenueCat webhook `event` object we rely on. */
export type RevenueCatWebhookEvent = {
  id?: string | null;
  type?: string | null;
  app_user_id?: string | null;
  original_app_user_id?: string | null;
  product_id?: string | null;
  new_product_id?: string | null;
  environment?: string | null;
  expiration_at_ms?: number | null;
  purchased_at_ms?: number | null;
  grace_period_expiration_at_ms?: number | null;
  original_transaction_id?: string | null;
  transaction_id?: string | null;
  cancel_reason?: string | null;
  store?: string | null;
};

export type AppleEntitlementDecision =
  | {
      action: "grant";
      appUserId: string;
      tier: PaidTier;
      billing: StripeBilling;
      originalTransactionId: string | null;
      environment: string | null;
    }
  | { action: "revoke"; appUserId: string; originalTransactionId: string | null }
  | { action: "ignore"; reason: string };

/** A refund/chargeback cancellation revokes access immediately (unlike auto-renew-off). */
export function isRevenueCatRefundCancellation(event: RevenueCatWebhookEvent): boolean {
  const type = String(event.type ?? "").trim().toUpperCase();
  const reason = String(event.cancel_reason ?? "").trim().toUpperCase();
  // RevenueCat reports store refunds as a CANCELLATION with cancel_reason
  // CUSTOMER_SUPPORT (or the dedicated REFUND type on newer payloads).
  if (type === "REFUND") return true;
  return type === "CANCELLATION" && reason === "CUSTOMER_SUPPORT";
}

function resolveAppUserId(event: RevenueCatWebhookEvent): string {
  return String(event.app_user_id ?? event.original_app_user_id ?? "").trim();
}

function resolveOriginalTransactionId(event: RevenueCatWebhookEvent): string | null {
  const id = String(event.original_transaction_id ?? event.transaction_id ?? "").trim();
  return id || null;
}

/**
 * True when this event's coverage window is still open (subscription active,
 * cancelled-but-not-yet-expired, or in billing grace). `expiration_at_ms` absent
 * is treated as active (a just-granted event that omitted it), letting the
 * reconciler be the authority on any later expiry.
 */
function isCoverageActive(event: RevenueCatWebhookEvent, nowMs: number): boolean {
  const grace = event.grace_period_expiration_at_ms;
  if (typeof grace === "number" && Number.isFinite(grace) && grace > nowMs) return true;
  const exp = event.expiration_at_ms;
  if (exp == null) return true;
  if (!Number.isFinite(exp)) return false;
  return exp > nowMs;
}

/**
 * Map one RevenueCat webhook event to an entitlement decision. Only our Pro/
 * Business subscription products are actionable; anything else is ignored.
 */
export function interpretRevenueCatWebhookEvent(
  event: RevenueCatWebhookEvent,
  nowMs: number,
): AppleEntitlementDecision {
  const appUserId = resolveAppUserId(event);
  if (!appUserId) return { action: "ignore", reason: "missing app_user_id" };

  const type = String(event.type ?? "").trim().toUpperCase();
  // Non-entitlement events RevenueCat may send: never touch access on these.
  if (type === "TEST") return { action: "ignore", reason: "test event" };
  if (type === "TRANSFER") {
    // Store-account transfer moves the entitlement between app_user_ids. Handled
    // as a known gap for launch (rare); the reconciler re-derives truth on read.
    return { action: "ignore", reason: "transfer event (reconciled on next read)" };
  }
  if (type === "INVOICE_ISSUANCE") return { action: "ignore", reason: "invoice issuance" };

  // PRODUCT_CHANGE carries the OLD product in product_id; the tier being granted
  // is new_product_id (an immediate upgrade must not re-grant the old tier).
  const productId =
    type === "PRODUCT_CHANGE"
      ? String(event.new_product_id ?? "").trim() || event.product_id
      : event.product_id;
  const map = tierForAppleProductId(productId);
  if (!map) return { action: "ignore", reason: "product not a managed subscription" };

  const originalTransactionId = resolveOriginalTransactionId(event);
  const environment = event.environment ? String(event.environment).trim() : null;

  // Definitive revokes.
  if (type === "EXPIRATION") return { action: "revoke", appUserId, originalTransactionId };
  if (isRevenueCatRefundCancellation(event)) {
    return { action: "revoke", appUserId, originalTransactionId };
  }

  // Everything else (INITIAL_PURCHASE, RENEWAL, PRODUCT_CHANGE, UNCANCELLATION,
  // CANCELLATION[auto-renew off], BILLING_ISSUE, SUBSCRIPTION_EXTENDED,
  // NON_RENEWING_PURCHASE, SUBSCRIPTION_PAUSED, TEMPORARY_ENTITLEMENT_GRANT):
  // decide purely on whether the coverage window is still open.
  if (isCoverageActive(event, nowMs)) {
    return {
      action: "grant",
      appUserId,
      tier: map.tier,
      billing: map.billing,
      originalTransactionId,
      environment,
    };
  }
  return { action: "revoke", appUserId, originalTransactionId };
}

/** Subset of a RevenueCat REST `subscriber` object we read during reconciliation. */
export type RevenueCatSubscriber = {
  subscriptions?: Record<
    string,
    {
      expires_date?: string | null;
      grace_period_expires_date?: string | null;
      store?: string | null;
    } | null
  > | null;
};

/**
 * The active managed tier for a subscriber per RevenueCat's authoritative state,
 * or null when NONE of our subscription products is currently active. Picks the
 * subscription with the furthest-future expiry when several are active. A
 * subscription counts as active while its `expires_date` OR
 * `grace_period_expires_date` is in the future.
 */
export function revenueCatSubscriberActiveTier(
  subscriber: RevenueCatSubscriber | null | undefined,
  nowMs: number,
): { tier: PaidTier; billing: StripeBilling; productId: string; expiresMs: number } | null {
  const subs = subscriber?.subscriptions ?? {};
  let best: { tier: PaidTier; billing: StripeBilling; productId: string; expiresMs: number } | null = null;

  for (const [productId, info] of Object.entries(subs)) {
    if (!info) continue;
    const map = tierForAppleProductId(productId);
    if (!map) continue;

    const exp = info.expires_date ? Date.parse(info.expires_date) : NaN;
    const grace = info.grace_period_expires_date ? Date.parse(info.grace_period_expires_date) : NaN;
    const expActive = !Number.isNaN(exp) && exp > nowMs;
    const graceActive = !Number.isNaN(grace) && grace > nowMs;
    if (!expActive && !graceActive) continue;

    const effectiveExpiry = Math.max(Number.isNaN(exp) ? 0 : exp, Number.isNaN(grace) ? 0 : grace);
    if (!best || effectiveExpiry > best.expiresMs) {
      best = { tier: map.tier, billing: map.billing, productId, expiresMs: effectiveExpiry };
    }
  }

  return best;
}
