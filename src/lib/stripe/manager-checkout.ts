import { resolveAppOrigin } from "@/lib/app-url";
import { generateManagerId } from "@/lib/manager-id";
import { normalizeProMonthlyPromoInput, PRO_MONTHLY_FIRST_FREE_PROMO_CODE } from "@/lib/stripe-promos";
import { resolveStripePriceIdForManagerTier } from "@/lib/stripe/resolve-manager-price";
import type { ManagerSubscriptionTier, StripeBilling } from "@/lib/stripe-price-ids";
import {
  buildManagerSubscriptionCheckoutBase,
  MANAGER_SUBSCRIPTION_TRIAL_DAYS,
} from "@/lib/stripe/subscription-checkout-session";
import { getStripe } from "@/lib/stripe";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export type ManagerCheckoutInput = {
  tier: ManagerSubscriptionTier;
  billing: StripeBilling;
  email?: string;
  fullName?: string;
  phone?: string;
  userId?: string;
  /** Reuse Axis ID from a pending manager signup instead of generating a new one. */
  managerId?: string;
  promo?: string;
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

  const price = await resolveStripePriceIdForManagerTier(tier, billing);
  if (!price) {
    const tierLabel = tier === "free" ? "free" : `${tier} ${billing}`;
    return {
      ok: false,
      status: 500,
      error: `No Stripe price found for ${tierLabel}. In Stripe, set lookup_key to axis_manager_${tier === "free" ? "free_monthly" : `${tier}_${billing}`} on the active price, or run scripts/setup-stripe-plan-prices.mjs.`,
    };
  }

  const appUrl = resolveAppOrigin(req);
  const email = typeof input.email === "string" ? input.email.trim() : "";
  const fullName = typeof input.fullName === "string" ? input.fullName.trim() : "";
  const phone = typeof input.phone === "string" ? input.phone.trim() : "";
  const userId = typeof input.userId === "string" ? input.userId.trim() : "";
  const promoRaw = typeof input.promo === "string" ? normalizeProMonthlyPromoInput(input.promo) : "";
  const promoUpper = promoRaw.toUpperCase();

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

  const promoCodeId = process.env.STRIPE_PROMOTION_CODE_ID_FIRST_MONTH_FREE?.trim();
  const autoFirstMonthFree =
    isProMonthly && promoUpper === PRO_MONTHLY_FIRST_FREE_PROMO_CODE && Boolean(promoCodeId);

  const allowPromotionCodes = isProMonthly && !autoFirstMonthFree;

  const sessionBase = buildManagerSubscriptionCheckoutBase({
    priceId: price,
    metadata,
    ...(email ? { customerEmail: email } : {}),
    ...(autoFirstMonthFree && promoCodeId ? { discounts: [{ promotion_code: promoCodeId }] } : {}),
    allowPromotionCodes,
    trialPeriodDays: MANAGER_SUBSCRIPTION_TRIAL_DAYS,
  });

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

    // Pre-save a pending manager_purchases row so manager-checkout-preview can find the session
    // from the DB fallback even if Stripe API retrieval fails (key mismatch, webhook delay, etc.).
    // Deliberately do NOT persist `tier`/`billing` here: for a paid plan those are what flip
    // `isManagerOnboardingComplete` to true (paid_at defaults to now()), which would grant portal
    // access before the payment method is added. They are written from the Stripe session metadata
    // only once payment actually completes (recordPaidManagerCheckoutSession), so a reserved-but-
    // unpaid paid signup stays incomplete until then.
    try {
      const db = createSupabaseServiceRoleClient();
      await db.from("manager_purchases").upsert(
        {
          stripe_checkout_session_id: session.id,
          email: email || null,
          manager_id: metadata.manager_id,
          full_name: fullName || null,
          ...(userId ? { user_id: userId } : {}),
        },
        { onConflict: "manager_id" },
      );
    } catch {
      // Non-fatal: checkout can still proceed; webhook will write the row when payment completes.
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
