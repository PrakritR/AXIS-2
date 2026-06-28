import { describe, expect, it } from "vitest";
import {
  buildManagerSubscriptionCheckoutBase,
  subscriptionCheckoutApplePayDomains,
  subscriptionCheckoutUsesDynamicPaymentMethods,
} from "@/lib/stripe/subscription-checkout-session";

describe("subscription-checkout-session (Apple Pay)", () => {
  it("omits payment_method_types so Stripe can offer Apple Pay", () => {
    const params = buildManagerSubscriptionCheckoutBase({
      priceId: "price_test",
      metadata: { tier: "pro", billing: "monthly", manager_id: "AXIS-TEST" },
      customerEmail: "mgr@example.com",
      allowPromotionCodes: true,
    });

    expect(params.mode).toBe("subscription");
    expect(params.line_items).toEqual([{ price: "price_test", quantity: 1 }]);
    expect(subscriptionCheckoutUsesDynamicPaymentMethods(params)).toBe(true);
    expect("payment_method_types" in params).toBe(false);
  });

  it("passes optional payment method configuration from env", () => {
    const prev = process.env.STRIPE_SUBSCRIPTION_PAYMENT_METHOD_CONFIGURATION;
    process.env.STRIPE_SUBSCRIPTION_PAYMENT_METHOD_CONFIGURATION = "pmc_test_subscriptions";
    try {
      const params = buildManagerSubscriptionCheckoutBase({
        priceId: "price_test",
        metadata: { tier: "business", billing: "annual", manager_id: "AXIS-TEST" },
      });
      expect(params.payment_method_configuration).toBe("pmc_test_subscriptions");
    } finally {
      if (prev === undefined) delete process.env.STRIPE_SUBSCRIPTION_PAYMENT_METHOD_CONFIGURATION;
      else process.env.STRIPE_SUBSCRIPTION_PAYMENT_METHOD_CONFIGURATION = prev;
    }
  });

  it("collects Apple Pay domains from public app URLs", () => {
    const prevCanonical = process.env.NEXT_PUBLIC_CANONICAL_APP_URL;
    const prevApp = process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_CANONICAL_APP_URL = "https://www.axis-seattle-housing.com";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    try {
      expect(subscriptionCheckoutApplePayDomains()).toEqual(["www.axis-seattle-housing.com"]);
    } finally {
      process.env.NEXT_PUBLIC_CANONICAL_APP_URL = prevCanonical;
      process.env.NEXT_PUBLIC_APP_URL = prevApp;
    }
  });
});
