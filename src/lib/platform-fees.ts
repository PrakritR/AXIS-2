import { normalizeManagerSkuTier, type ManagerSkuTier } from "@/lib/manager-access";

/**
 * Platform take rates when using Stripe Connect destination charges.
 * Basis points = hundredths of a percent; 100 bps = 1%.
 *
 * Stripe: pass `application_fee_amount` (integer cents) on Checkout Sessions /
 * PaymentIntents created with `transfer_data.destination` = connected account id.
 */

export type PlatformFeeKind = "application_fee" | "rent";

export const PLATFORM_FEE_BPS_BY_TIER: Record<ManagerSkuTier, Record<PlatformFeeKind, number>> = {
  free: {
    application_fee: 200,
    rent: 25,
  },
  pro: {
    application_fee: 200,
    rent: 0,
  },
  business: {
    application_fee: 0,
    rent: 0,
  },
};

export function platformFeeBpsForTier(tier: string | null | undefined, kind: PlatformFeeKind): number {
  const normalized = normalizeManagerSkuTier(tier) ?? "free";
  return PLATFORM_FEE_BPS_BY_TIER[normalized][kind];
}

export function platformApplicationFeeBps(tier?: string | null): number {
  return platformFeeBpsForTier(tier, "application_fee");
}

export function platformRentBps(tier?: string | null): number {
  return platformFeeBpsForTier(tier, "rent");
}

/** Integer cents taken by the platform from a gross charge (floor). */
export function platformFeeCents(grossAmountCents: number, kind: PlatformFeeKind, tier?: string | null): number {
  if (!Number.isFinite(grossAmountCents) || grossAmountCents <= 0) return 0;
  const bps = platformFeeBpsForTier(tier, kind);
  return Math.floor((grossAmountCents * bps) / 10000);
}

/** Public labels for UI (e.g. 2 and 0.25). */
export function platformFeeDisplayPercents(tier?: string | null): { applicationFee: number; rent: number } {
  return {
    applicationFee: platformApplicationFeeBps(tier) / 100,
    rent: platformRentBps(tier) / 100,
  };
}
