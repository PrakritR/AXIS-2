import type { ManagerSkuTier } from "@/lib/manager-access";

export type PaidTier = "pro" | "business";
export type StripeBilling = "monthly" | "annual";

/** Stripe Price IDs from env — shared by Checkout and subscription updates. */
export function stripePriceIdForPaidTier(tier: PaidTier, billing: StripeBilling): string | undefined {
  if (tier === "pro") {
    return billing === "annual" ? process.env.STRIPE_PRICE_PRO_ANNUAL : process.env.STRIPE_PRICE_PRO_MONTHLY;
  }
  if (tier === "business") {
    return billing === "annual" ? process.env.STRIPE_PRICE_BUSINESS_ANNUAL : process.env.STRIPE_PRICE_BUSINESS_MONTHLY;
  }
  return undefined;
}

/** Map manager SKU to Stripe tier (free has no price). */
export function managerSkuToPaidTier(tier: ManagerSkuTier): PaidTier | null {
  if (tier === "pro") return "pro";
  if (tier === "business") return "business";
  return null;
}

/** Infer monthly vs annual from which env price id matches (for subscription updates). */
export function inferBillingFromStripePriceId(priceId: string | undefined | null): StripeBilling | null {
  if (!priceId) return null;
  const p = priceId.trim();
  const monthly =
    p === process.env.STRIPE_PRICE_PRO_MONTHLY?.trim() || p === process.env.STRIPE_PRICE_BUSINESS_MONTHLY?.trim();
  if (monthly) return "monthly";
  const annual =
    p === process.env.STRIPE_PRICE_PRO_ANNUAL?.trim() || p === process.env.STRIPE_PRICE_BUSINESS_ANNUAL?.trim();
  if (annual) return "annual";
  return null;
}

export function inferPaidTierFromStripePriceId(priceId: string | undefined | null): PaidTier | null {
  if (!priceId) return null;
  const p = priceId.trim();
  if (
    p === process.env.STRIPE_PRICE_PRO_MONTHLY?.trim() ||
    p === process.env.STRIPE_PRICE_PRO_ANNUAL?.trim()
  ) {
    return "pro";
  }
  if (
    p === process.env.STRIPE_PRICE_BUSINESS_MONTHLY?.trim() ||
    p === process.env.STRIPE_PRICE_BUSINESS_ANNUAL?.trim()
  ) {
    return "business";
  }
  return null;
}
