import type { PlanTierId } from "@/data/manager-plan-tiers";

export function managerPricingOauthPath(opts: {
  tier: PlanTierId;
  billing: "monthly" | "annual";
  discountPercent?: number | null;
  promo?: string;
}): string {
  const params = new URLSearchParams();
  params.set("tier", opts.tier);
  params.set("billing", opts.billing);
  if (typeof opts.discountPercent === "number" && opts.discountPercent > 0) {
    params.set("d", String(Math.min(100, Math.round(opts.discountPercent))));
  }
  const promo = opts.promo?.trim();
  if (promo) params.set("promo", promo);
  return `/auth/manager-pricing-oauth?${params.toString()}`;
}
