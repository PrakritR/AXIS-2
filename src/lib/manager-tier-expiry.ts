import { MANAGER_SUBSCRIPTION_TRIAL_DAYS } from "@/lib/stripe/subscription-checkout-session";
import { normalizeManagerSkuTier, type ManagerSkuTier } from "@/lib/manager-access";

export type ManagerPurchaseExpiryInput = {
  tier: string | null | undefined;
  billing: string | null | undefined;
  paid_at?: string | null;
  stripe_subscription_id?: string | null;
};

export function isSignupTrialManagerPurchase(billing: string | null | undefined): boolean {
  return billing?.toLowerCase().trim() === "trial";
}

/** End of the current paid period for admin-assigned / non-Stripe purchases. */
export function managerPurchasePeriodEndMs(
  input: ManagerPurchaseExpiryInput,
  nowMs = Date.now(),
): number | null {
  void nowMs;
  const tier = normalizeManagerSkuTier(input.tier);
  if (!tier || tier === "free") return null;
  if (input.stripe_subscription_id?.trim()) return null;

  const billing = input.billing?.toLowerCase().trim();
  if (billing === "trial") {
    const paidAt = input.paid_at ? new Date(input.paid_at) : null;
    if (!paidAt || Number.isNaN(paidAt.getTime())) return null;
    const end = new Date(paidAt);
    end.setUTCDate(end.getUTCDate() + MANAGER_SUBSCRIPTION_TRIAL_DAYS);
    return end.getTime();
  }

  if (billing !== "monthly" && billing !== "annual") return null;

  const paidAt = input.paid_at ? new Date(input.paid_at) : null;
  if (!paidAt || Number.isNaN(paidAt.getTime())) return null;

  const end = new Date(paidAt);
  if (billing === "annual") {
    end.setUTCFullYear(end.getUTCFullYear() + 1);
  } else {
    end.setUTCMonth(end.getUTCMonth() + 1);
  }
  return end.getTime();
}

export function isManagerPurchasePeriodExpired(
  input: ManagerPurchaseExpiryInput,
  nowMs = Date.now(),
): boolean {
  const endMs = managerPurchasePeriodEndMs(input, nowMs);
  return endMs !== null && nowMs >= endMs;
}

/** Tier after applying date-based expiry (does not call Stripe). */
export function resolveEffectiveManagerTier(
  input: ManagerPurchaseExpiryInput,
  nowMs = Date.now(),
): ManagerSkuTier | null {
  const tier = normalizeManagerSkuTier(input.tier);
  if (!tier) return null;
  if (tier === "free") return "free";
  if (isManagerPurchasePeriodExpired(input, nowMs)) return "free";
  return tier;
}
