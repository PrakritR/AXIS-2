import type { PaidTier, StripeBilling } from "@/lib/stripe-price-ids";

/**
 * Apple In-App Purchase as a grant source on `manager_purchases`. Pure helpers
 * only (no server-only imports) so both the client plan UI and the server
 * reconciler/webhook can share them.
 *
 * Apple grants are marked with `billing = "apple"` and anchored by
 * `apple_original_transaction_id` — the App Store's stable subscription id
 * (survives renewals). A row only counts as an authorized Apple-paid tier when
 * BOTH are present, so a stray `billing = "apple"` with no transaction id can
 * never grant access. Mirrors the admin (`admin_` session prefix) and waiver
 * (`promo_code`) grant markers.
 */

export const APPLE_MANAGER_PURCHASE_BILLING = "apple" as const;

/**
 * Synthetic `stripe_checkout_session_id` for Apple rows (the column is
 * UNIQUE NOT NULL, so every non-Stripe grant synthesizes one — same pattern as
 * `admin_portal_*` / `axis_waiver_*`).
 */
export const APPLE_MANAGER_PURCHASE_SESSION_PREFIX = "apple_iap_" as const;

export function appleManagerPurchaseSessionId(originalTransactionId: string): string {
  return `${APPLE_MANAGER_PURCHASE_SESSION_PREFIX}${originalTransactionId.trim()}`;
}

export function isAppleManagedManagerPurchase(
  stripeCheckoutSessionId: string | null | undefined,
): boolean {
  return Boolean(stripeCheckoutSessionId?.trim().startsWith(APPLE_MANAGER_PURCHASE_SESSION_PREFIX));
}

/**
 * True when the row is an authorized Apple-billed paid grant. Requires the
 * `apple` billing marker AND a stored original transaction id — the same
 * "marker + anchor" rule that keeps this grant from being spoofed by a bare
 * tier write. This is the predicate the revoke sweep and the access resolver
 * whitelist on (see manager-tier-sync.ts / manager-access.ts).
 */
export function isAppleBilledManagerPurchase(
  billing: string | null | undefined,
  appleOriginalTransactionId: string | null | undefined,
): boolean {
  const b = String(billing ?? "").trim().toLowerCase();
  return b === APPLE_MANAGER_PURCHASE_BILLING && Boolean(appleOriginalTransactionId?.trim());
}

/**
 * App Store product ids → the plan tier + cadence they unlock. Product ids are
 * immutable once created in App Store Connect (see report §4.1). Pro + Business
 * monthly and annual are offered together. App Store Connect and RevenueCat must
 * use these exact ids so every package maps to one tier and one billing cadence.
 *
 * These are keyed on the CURRENT bundle id `space.proplane.app` (the iOS rebrand
 * from `com.axisseattlehousing.app`). App Store Connect product ids don't have to
 * prefix the bundle id, but we keep them aligned so the product namespace tracks
 * the app. The RevenueCat products firstmate configures MUST use these exact ids,
 * or offerings are filtered out (nothing purchasable) and webhook grants ignored.
 */
export const APPLE_IAP_PRODUCT_TIERS: Record<string, { tier: PaidTier; billing: StripeBilling }> = {
  "space.proplane.app.pro.monthly": { tier: "pro", billing: "monthly" },
  "space.proplane.app.business.monthly": { tier: "business", billing: "monthly" },
  "space.proplane.app.pro.annual": { tier: "pro", billing: "annual" },
  "space.proplane.app.business.annual": { tier: "business", billing: "annual" },
};

/** Product ids offered on iOS (Pro + Business, monthly + annual). */
export const APPLE_IAP_OFFERED_PRODUCT_IDS = [
  "space.proplane.app.pro.monthly",
  "space.proplane.app.pro.annual",
  "space.proplane.app.business.monthly",
  "space.proplane.app.business.annual",
] as const;

/** Map an App Store product id to its plan tier + cadence, or null if not ours. */
export function tierForAppleProductId(
  productId: string | null | undefined,
): { tier: PaidTier; billing: StripeBilling } | null {
  const id = productId?.trim();
  if (!id) return null;
  return APPLE_IAP_PRODUCT_TIERS[id] ?? null;
}
