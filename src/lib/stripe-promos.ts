/** Customer-facing Stripe promotion code: first month free, Pro monthly only (see SUPABASE_STRIPE_SETUP.md). */
export const PRO_MONTHLY_FIRST_FREE_PROMO_CODE = "FREEFIRST";

/** Legacy / alternate spelling accepted in the pricing form (normalized to FREEFIRST for validation). */
export const PRO_MONTHLY_FIRST_FREE_PROMO_ALIASES = ["FIRSTFREE", "FREEFIRST"] as const;

export function normalizeProMonthlyPromoInput(raw: string): string {
  const t = raw.trim();
  const u = t.toUpperCase();
  if (PRO_MONTHLY_FIRST_FREE_PROMO_ALIASES.includes(u as (typeof PRO_MONTHLY_FIRST_FREE_PROMO_ALIASES)[number])) {
    return PRO_MONTHLY_FIRST_FREE_PROMO_CODE;
  }
  return t;
}
