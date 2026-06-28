import { resolveAppOrigin } from "@/lib/app-url";
import { generateManagerId } from "@/lib/manager-id";
import { normalizeProMonthlyPromoInput, PRO_MONTHLY_FIRST_FREE_PROMO_CODE } from "@/lib/stripe-promos";
import {
  normalizeOnboardDiscountPercent,
  stripeCouponIdForOnboardDiscount,
} from "@/lib/stripe-onboard-discount";
import { resolveStripePriceIdForPaidTier } from "@/lib/stripe/resolve-manager-price";
import type { PaidTier, StripeBilling } from "@/lib/stripe-price-ids";
import { getStripe } from "@/lib/stripe";

export type ManagerCheckoutInput = {
  tier: PaidTier;
  billing: StripeBilling;
  email?: string;
  fullName?: string;
  phone?: string;
  userId?: string;
  /** Reuse Axis ID from a pending manager signup instead of generating a new one. */
  managerId?: string;
  promo?: string;
  discountPercent?: number;
  embedded?: boolean;
  req: Request;
};

export type ManagerCheckoutResult =
  | { ok: true; embedded: true; clientSecret: string; sessionId: string }
  | { ok: true; embedded: false; url: string; sessionId: string }
  | { ok: false; status: number; error: string; code?: string };

export async function createManagerCheckoutSession(input: ManagerCheckoutInput): Promise<ManagerCheckoutResult> {
  const { tier, billing, req } = input;
  const useEmbedded = input.embedded !== false;

  const price = await resolveStripePriceIdForPaidTier(tier, billing);
  if (!price) {
    return {
      ok: false,
      status: 500,
      error: `No Stripe price found for ${tier} ${billing}. In Stripe, set lookup_key to axis_manager_${tier}_${billing} on the active price, or run scripts/setup-stripe-plan-prices.mjs.`,
    };
  }

  const appUrl = resolveAppOrigin(req);
  const email = typeof input.email === "string" ? input.email.trim() : "";
  const fullName = typeof input.fullName === "string" ? input.fullName.trim() : "";
  const phone = typeof input.phone === "string" ? input.phone.trim() : "";
  const userId = typeof input.userId === "string" ? input.userId.trim() : "";
  const promoRaw = typeof input.promo === "string" ? normalizeProMonthlyPromoInput(input.promo) : "";
  const promoUpper = promoRaw.toUpperCase();
  const onboardDiscount = normalizeOnboardDiscountPercent(input.discountPercent);

  if (onboardDiscount === 100) {
    return {
      ok: false,
      status: 400,
      error: "100% onboard discount must use free signup (no Stripe checkout).",
      code: "REQUIRES_SIGNUP_INTENT",
    };
  }

  const isProMonthly = tier === "pro" && billing === "monthly";
  if (promoUpper === PRO_MONTHLY_FIRST_FREE_PROMO_CODE && !isProMonthly) {
    return {
      ok: false,
      status: 400,
      error: `Promo ${PRO_MONTHLY_FIRST_FREE_PROMO_CODE} applies only to Pro monthly billing.`,
    };
  }

  const stripe = getStripe();

  const metadata: Record<string, string> = {
    tier,
    billing,
    manager_id: input.managerId?.trim() || generateManagerId(),
  };
  if (email) metadata.email = email;
  if (fullName) metadata.full_name = fullName;
  if (phone) metadata.phone = phone;
  if (userId) metadata.userId = userId;
  if (promoRaw) metadata.promo = promoRaw;
  if (onboardDiscount != null) metadata.onboard_discount_percent = String(onboardDiscount);

  const promoCodeId = process.env.STRIPE_PROMOTION_CODE_ID_FIRST_MONTH_FREE?.trim();
  const autoFirstMonthFree =
    isProMonthly && promoUpper === PRO_MONTHLY_FIRST_FREE_PROMO_CODE && Boolean(promoCodeId);

  const allowPromotionCodes = isProMonthly && !autoFirstMonthFree && onboardDiscount == null;

  let onboardCouponId: string | null = null;
  if (onboardDiscount != null) {
    onboardCouponId = await stripeCouponIdForOnboardDiscount(onboardDiscount, "once");
  }

  const sessionBase = {
    mode: "subscription" as const,
    payment_method_types: ["card"],
    line_items: [{ price, quantity: 1 }],
    ...(email ? { customer_email: email } : {}),
    metadata,
    ...(autoFirstMonthFree && promoCodeId ? { discounts: [{ promotion_code: promoCodeId }] } : {}),
    ...(onboardCouponId ? { discounts: [{ coupon: onboardCouponId }] } : {}),
    ...(allowPromotionCodes ? { allow_promotion_codes: true } : {}),
  };

  const returnTarget = userId ? "manager-oauth-finish" : "manager-id";
  const finishPath = `/auth/${returnTarget}?session_id={CHECKOUT_SESSION_ID}`;

  if (useEmbedded) {
    const session = await stripe.checkout.sessions.create({
      ui_mode: "embedded_page",
      ...sessionBase,
      return_url: `${appUrl}${finishPath}`,
    } as Parameters<typeof stripe.checkout.sessions.create>[0]);

    const clientSecret = session.client_secret;
    if (!clientSecret) {
      return { ok: false, status: 500, error: "Stripe did not return a client secret for embedded checkout." };
    }

    return { ok: true, embedded: true, clientSecret, sessionId: session.id };
  }

  const session = await stripe.checkout.sessions.create({
    ui_mode: "hosted_page",
    ...sessionBase,
    success_url: `${appUrl}${finishPath}`,
    cancel_url: `${appUrl}/partner/pricing`,
  } as Parameters<typeof stripe.checkout.sessions.create>[0]);

  if (!session.url) {
    return { ok: false, status: 500, error: "Stripe did not return a checkout URL." };
  }

  return { ok: true, embedded: false, url: session.url, sessionId: session.id };
}
