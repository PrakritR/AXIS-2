import { getStripe } from "@/lib/stripe";

export type OnboardDiscountDuration = "once" | "forever";

/** Clamp and validate admin-entered onboard discount (1–100). 100 = free signup (no Stripe). */
export function normalizeOnboardDiscountPercent(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number.parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(n) || n < 1 || n > 100) return null;
  return Math.round(n);
}

function couponIdForPercent(percent: number, duration: OnboardDiscountDuration): string {
  return `AXIS_ONBOARD_${percent}_${duration.toUpperCase()}`;
}

/**
 * Reuse or create a Stripe percent-off coupon for manager onboarding links.
 * `once` = first invoice only; `forever` = every billing cycle.
 */
export async function stripeCouponIdForOnboardDiscount(
  percent: number,
  duration: OnboardDiscountDuration = "once",
): Promise<string> {
  if (percent < 1 || percent > 99) {
    throw new Error("Onboard Stripe discount must be between 1 and 99 percent.");
  }

  const stripe = getStripe();
  const id = couponIdForPercent(percent, duration);

  try {
    const existing = await stripe.coupons.retrieve(id);
    if (existing.valid) return id;
  } catch {
    /* create below */
  }

  await stripe.coupons.create({
    id,
    percent_off: percent,
    duration,
    name: `Axis onboard ${percent}% off (${duration})`,
  });

  return id;
}
