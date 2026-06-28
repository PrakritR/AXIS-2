import { getStripe } from "@/lib/stripe";
import type { ManagerSubscriptionTier, PaidTier, StripeBilling } from "@/lib/stripe-price-ids";

const CACHE_TTL_MS = 5 * 60 * 1000;

type CacheEntry = { priceId: string; expiresAt: number };

const priceCache = new Map<string, CacheEntry>();

function cacheKey(tier: ManagerSubscriptionTier, billing: StripeBilling): string {
  return `${tier}:${billing}`;
}

function isStripePriceId(value: string | undefined): value is string {
  return Boolean(value?.trim().startsWith("price_"));
}

function envPriceId(tier: ManagerSubscriptionTier, billing: StripeBilling): string | undefined {
  if (tier === "free") {
    return process.env.STRIPE_PRICE_FREE_MONTHLY;
  }
  if (tier === "pro") {
    return billing === "annual" ? process.env.STRIPE_PRICE_PRO_ANNUAL : process.env.STRIPE_PRICE_PRO_MONTHLY;
  }
  return billing === "annual" ? process.env.STRIPE_PRICE_BUSINESS_ANNUAL : process.env.STRIPE_PRICE_BUSINESS_MONTHLY;
}

function lookupKeyFor(tier: ManagerSubscriptionTier, billing: StripeBilling): string {
  if (tier === "free") return "axis_manager_free_monthly";
  return `axis_manager_${tier}_${billing}`;
}

function productKeyFor(tier: ManagerSubscriptionTier): string {
  if (tier === "free") return "axis_free";
  return tier === "pro" ? "axis_pro" : "axis_business";
}

function stripeInterval(billing: StripeBilling): "month" | "year" {
  return billing === "annual" ? "year" : "month";
}

/**
 * Resolves a Stripe Price id for manager plans (Free, Pro, Business).
 * Priority: valid env `price_…` override → Stripe lookup_key → product metadata `axis_plan`.
 */
export async function resolveStripePriceIdForManagerTier(
  tier: ManagerSubscriptionTier,
  billing: StripeBilling,
): Promise<string | null> {
  const effectiveBilling = tier === "free" ? "monthly" : billing;
  const key = cacheKey(tier, effectiveBilling);
  const cached = priceCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.priceId;
  }

  const fromEnv = envPriceId(tier, effectiveBilling)?.trim();
  if (isStripePriceId(fromEnv)) {
    priceCache.set(key, { priceId: fromEnv, expiresAt: Date.now() + CACHE_TTL_MS });
    return fromEnv;
  }

  const stripe = getStripe();
  const lookupKey = lookupKeyFor(tier, effectiveBilling);

  try {
    const prices = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1, active: true });
    const byLookup = prices.data[0];
    if (byLookup?.id) {
      priceCache.set(key, { priceId: byLookup.id, expiresAt: Date.now() + CACHE_TTL_MS });
      return byLookup.id;
    }
  } catch {
    /* fall through to product metadata scan */
  }

  const listed = await stripe.products.list({ limit: 100, active: true });
  const product = listed.data.find((p) => p.metadata?.axis_plan === productKeyFor(tier));
  if (!product) return null;

  const interval = stripeInterval(effectiveBilling);
  const priceList = await stripe.prices.list({ product: product.id, limit: 100, active: true });
  const match = priceList.data.find((p) => {
    if (p.type !== "recurring") return false;
    if (tier === "free") return p.unit_amount === 0 && p.recurring?.interval === "month";
    return p.recurring?.interval === interval;
  });
  if (!match?.id) return null;

  priceCache.set(key, { priceId: match.id, expiresAt: Date.now() + CACHE_TTL_MS });
  return match.id;
}

/** @deprecated Use resolveStripePriceIdForManagerTier */
export async function resolveStripePriceIdForPaidTier(
  tier: PaidTier,
  billing: StripeBilling,
): Promise<string | null> {
  return resolveStripePriceIdForManagerTier(tier, billing);
}

/** Clears in-memory cache (tests). */
export function clearManagerPriceCache(): void {
  priceCache.clear();
}
