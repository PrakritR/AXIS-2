/** Customer-facing Stripe promotion code: first month free, Pro monthly only (see SUPABASE_STRIPE_SETUP.md). */
export const PRO_MONTHLY_FIRST_FREE_PROMO_CODE = "FREEFIRST";
/** Customer-facing bypass code: skips Stripe checkout entirely and creates the signup intent directly. */
export const FULL_PAYMENT_WAIVER_PROMO_CODE = "FREE100";

/** Legacy / alternate spellings accepted in the pricing form (normalized to FREEFIRST for validation). */
export const PRO_MONTHLY_FIRST_FREE_PROMO_ALIASES = ["FIRSTFREE", "FREEFIRST", "FIRSTFEE"] as const;

export function normalizeProMonthlyPromoInput(raw: unknown): string {
  if (raw == null) return "";
  const s = typeof raw === "string" ? raw : String(raw);
  const t = s.trim();
  if (!t) return "";
  const u = t.toUpperCase();
  if (u === FULL_PAYMENT_WAIVER_PROMO_CODE) {
    return FULL_PAYMENT_WAIVER_PROMO_CODE;
  }
  if (PRO_MONTHLY_FIRST_FREE_PROMO_ALIASES.includes(u as (typeof PRO_MONTHLY_FIRST_FREE_PROMO_ALIASES)[number])) {
    return PRO_MONTHLY_FIRST_FREE_PROMO_CODE;
  }
  return t;
}
