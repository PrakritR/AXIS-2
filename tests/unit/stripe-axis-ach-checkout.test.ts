import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Stripe from "stripe";
import {
  axisAchCheckoutPaid,
  axisAchCheckoutProcessing,
  createAxisAchCheckoutSession,
} from "@/lib/stripe-axis-ach-checkout";
import { mockCheckoutSession } from "../mocks/stripe/events";

describe("stripe-axis-ach-checkout", () => {
  it("detects paid ACH checkout", () => {
    expect(axisAchCheckoutPaid(mockCheckoutSession({ payment_status: "paid" }))).toBe(true);
    expect(axisAchCheckoutPaid(mockCheckoutSession({ payment_status: "no_payment_required" }))).toBe(true);
    expect(axisAchCheckoutPaid(mockCheckoutSession({ payment_status: "unpaid" }))).toBe(false);
  });

  it("detects processing ACH checkout", () => {
    expect(
      axisAchCheckoutProcessing(mockCheckoutSession({ status: "complete", payment_status: "unpaid" })),
    ).toBe(true);
    expect(axisAchCheckoutProcessing(mockCheckoutSession({ status: "open", payment_status: "unpaid" }))).toBe(false);
  });
});

// Apple Pay / Google Pay are surfaced by Stripe Checkout on the CARD method-class.
// These assert the session params the builder hands Stripe so the wallet path
// (and its fee model) can't silently regress. `stripe` is injected, so no network.
describe("createAxisAchCheckoutSession — payment-method surface", () => {
  const PREV_PMC = process.env.STRIPE_RESIDENT_CARD_PAYMENT_METHOD_CONFIGURATION;

  function captureStripe() {
    const calls: Record<string, unknown>[] = [];
    const stripe = {
      checkout: {
        sessions: {
          create: async (params: Record<string, unknown>) => {
            calls.push(params);
            return { id: "cs_test", url: "https://checkout.stripe.test/x", client_secret: "cs_secret" };
          },
        },
      },
    } as unknown as Stripe;
    return { stripe, calls };
  }

  const baseInput = {
    residentEmail: "resident@example.com",
    amountCents: 5000,
    productName: "Rental application fee",
    metadata: { purpose: "rental_application_fee" },
    mode: "hosted" as const,
    destinationAccountId: "acct_test",
    successUrl: "https://app.test/ok",
    cancelUrl: "https://app.test/cancel",
  };

  beforeEach(() => {
    delete process.env.STRIPE_RESIDENT_CARD_PAYMENT_METHOD_CONFIGURATION;
  });

  afterEach(() => {
    if (PREV_PMC === undefined) delete process.env.STRIPE_RESIDENT_CARD_PAYMENT_METHOD_CONFIGURATION;
    else process.env.STRIPE_RESIDENT_CARD_PAYMENT_METHOD_CONFIGURATION = PREV_PMC;
  });

  it("card without a PMC env falls back to an explicit card allowlist (never leaks ACH)", async () => {
    const { stripe, calls } = captureStripe();
    await createAxisAchCheckoutSession(stripe, { ...baseInput, paymentMethod: "card" });
    expect(calls[0]?.payment_method_types).toEqual(["card"]);
    expect(calls[0]).not.toHaveProperty("payment_method_configuration");
  });

  it("card WITH a PMC env uses dynamic payment methods (so Apple Pay can appear)", async () => {
    process.env.STRIPE_RESIDENT_CARD_PAYMENT_METHOD_CONFIGURATION = "pmc_card_wallets";
    const { stripe, calls } = captureStripe();
    await createAxisAchCheckoutSession(stripe, { ...baseInput, paymentMethod: "card" });
    // Dynamic payment methods require OMITTING payment_method_types entirely.
    expect(calls[0]).not.toHaveProperty("payment_method_types");
    expect(calls[0]?.payment_method_configuration).toBe("pmc_card_wallets");
  });

  it("ach stays an explicit bank-only session even when a card PMC is configured", async () => {
    process.env.STRIPE_RESIDENT_CARD_PAYMENT_METHOD_CONFIGURATION = "pmc_card_wallets";
    const { stripe, calls } = captureStripe();
    await createAxisAchCheckoutSession(stripe, { ...baseInput, paymentMethod: "ach" });
    expect(calls[0]?.payment_method_types).toEqual(["us_bank_account"]);
    expect(calls[0]).not.toHaveProperty("payment_method_configuration");
  });
});
