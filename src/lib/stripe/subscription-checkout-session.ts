import type Stripe from "stripe";

/** Default trial for new manager software subscriptions (card or Apple Pay required). */
export const MANAGER_SUBSCRIPTION_TRIAL_DAYS = 14;

/**
 * Manager Pro/Business subscription checkout — shared by signup and portal upgrade.
 *
 * Apple Pay (and Link) appear when:
 * 1. This module omits `payment_method_types` (Stripe dynamic payment methods).
 * 2. Apple Pay is enabled in Stripe Dashboard → Settings → Payment methods.
 * 3. Checkout domains are registered — run scripts/setup-stripe-apple-pay-domains.mjs.
 *
 * @see docs/stripe-apple-pay-subscriptions.md
 */

export type ManagerSubscriptionCheckoutBaseInput = {
  priceId: string;
  metadata: Record<string, string>;
  customerEmail?: string;
  clientReferenceId?: string;
  discounts?: Stripe.Checkout.SessionCreateParams.Discount[];
  allowPromotionCodes?: boolean;
  /** When set, Checkout collects a payment method and defers billing until trial ends. */
  trialPeriodDays?: number;
};

export type ManagerSubscriptionCheckoutBaseParams = Pick<
  Stripe.Checkout.SessionCreateParams,
  | "mode"
  | "line_items"
  | "metadata"
  | "customer_email"
  | "client_reference_id"
  | "discounts"
  | "allow_promotion_codes"
  | "payment_method_configuration"
  | "subscription_data"
>;

/** Checkout fields shared by embedded and hosted manager subscription sessions. */
export function buildManagerSubscriptionCheckoutBase(
  input: ManagerSubscriptionCheckoutBaseInput,
): ManagerSubscriptionCheckoutBaseParams {
  const paymentMethodConfiguration = process.env.STRIPE_SUBSCRIPTION_PAYMENT_METHOD_CONFIGURATION?.trim();

  const trialDays =
    typeof input.trialPeriodDays === "number" && input.trialPeriodDays > 0
      ? Math.floor(input.trialPeriodDays)
      : null;

  return {
    mode: "subscription",
    line_items: [{ price: input.priceId, quantity: 1 }],
    metadata: input.metadata,
    ...(input.customerEmail ? { customer_email: input.customerEmail } : {}),
    ...(input.clientReferenceId ? { client_reference_id: input.clientReferenceId } : {}),
    ...(input.discounts?.length ? { discounts: input.discounts } : {}),
    ...(input.allowPromotionCodes ? { allow_promotion_codes: true } : {}),
    ...(paymentMethodConfiguration ? { payment_method_configuration: paymentMethodConfiguration } : {}),
    ...(trialDays
      ? {
          subscription_data: {
            trial_period_days: trialDays,
            metadata: input.metadata,
          },
        }
      : {}),
    // Do not set payment_method_types — it restricts to card-only and blocks Apple Pay.
  };
}

/** Guard used in tests — subscription checkout must stay on dynamic payment methods. */
export function subscriptionCheckoutUsesDynamicPaymentMethods(
  params: Record<string, unknown>,
): boolean {
  return !("payment_method_types" in params);
}

/** Hostnames that should be registered for Apple Pay on subscription checkout. */
export function subscriptionCheckoutApplePayDomains(): string[] {
  const raw = [
    process.env.NEXT_PUBLIC_CANONICAL_APP_URL?.trim(),
    process.env.NEXT_PUBLIC_APP_URL?.trim(),
  ].filter(Boolean) as string[];

  const hostnames = new Set<string>();
  for (const value of raw) {
    try {
      const hostname = new URL(value).hostname.toLowerCase();
      if (hostname && hostname !== "localhost" && hostname !== "127.0.0.1") {
        hostnames.add(hostname);
      }
    } catch {
      /* ignore invalid URLs */
    }
  }
  return [...hostnames];
}
