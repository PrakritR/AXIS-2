import type { PlanTierId } from "@/data/manager-plan-tiers";

export function managerPricingOauthPath(opts: {
  tier: PlanTierId;
  billing: "monthly" | "annual";
  promo?: string;
}): string {
  const params = new URLSearchParams();
  params.set("tier", opts.tier);
  params.set("billing", opts.billing);
  const promo = opts.promo?.trim();
  if (promo) params.set("promo", promo);
  return `/auth/manager-pricing-oauth?${params.toString()}`;
}
