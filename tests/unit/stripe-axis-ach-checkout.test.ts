import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

  function enabled() {
    return { available: true, display_preference: { preference: "on", value: "on" } };
  }

  function disabled() {
    return { available: false, display_preference: { preference: "none", value: "off" } };
  }

  const CARD_SCOPED_PMC = {
    object: "payment_method_configuration",
    name: "Card + wallets",
    active: true,
    is_default: false,
    livemode: false,
    application: null,
    card: enabled(),
    apple_pay: enabled(),
    google_pay: enabled(),
    link: disabled(),
    us_bank_account: disabled(),
    klarna: disabled(),
  };

  function captureStripe(pmc?: Record<string, unknown> | Error) {
    const calls: Record<string, unknown>[] = [];
    const pmcLookups: string[] = [];
    const stripe = {
      checkout: {
        sessions: {
          create: async (params: Record<string, unknown>) => {
            calls.push(params);
            return { id: "cs_test", url: "https://checkout.stripe.test/x", client_secret: "cs_secret" };
          },
        },
      },
      paymentMethodConfigurations: {
        retrieve: async (id: string) => {
          pmcLookups.push(id);
          if (pmc instanceof Error) throw pmc;
          return { id, ...(pmc ?? CARD_SCOPED_PMC) };
        },
      },
    } as unknown as Stripe;
    return { stripe, calls, pmcLookups };
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

  it("card WITH a card-scoped PMC env uses dynamic payment methods (so Apple Pay can appear)", async () => {
    process.env.STRIPE_RESIDENT_CARD_PAYMENT_METHOD_CONFIGURATION = "pmc_card_wallets";
    const { stripe, calls } = captureStripe();
    await createAxisAchCheckoutSession(stripe, { ...baseInput, paymentMethod: "card" });
    // Dynamic payment methods require OMITTING payment_method_types entirely.
    expect(calls[0]).not.toHaveProperty("payment_method_types");
    expect(calls[0]?.payment_method_configuration).toBe("pmc_card_wallets");
  });

  // The card fee line item and the Connect application_fee_amount are computed
  // BEFORE the session exists, so a PMC that also offers a different-fee method
  // would break "manager payout == full subtotal".
  it("rejects a PMC that enables a non-card method and falls back to explicit card", async () => {
    process.env.STRIPE_RESIDENT_CARD_PAYMENT_METHOD_CONFIGURATION = "pmc_card_plus_ach";
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const { stripe, calls } = captureStripe({ ...CARD_SCOPED_PMC, us_bank_account: enabled() });
    await createAxisAchCheckoutSession(stripe, { ...baseInput, paymentMethod: "card" });
    expect(calls[0]?.payment_method_types).toEqual(["card"]);
    expect(calls[0]).not.toHaveProperty("payment_method_configuration");
    expect(logged).toHaveBeenCalled();
    expect(String(logged.mock.calls[0]?.[0])).toContain("us_bank_account");
    logged.mockRestore();
  });

  // Link is priced at the card rate here, so a card+wallets+Link PMC is still
  // fee-exact — rejecting it would strip Apple Pay from a valid configuration.
  it("accepts a PMC that also enables Link (identical card-rate fee)", async () => {
    process.env.STRIPE_RESIDENT_CARD_PAYMENT_METHOD_CONFIGURATION = "pmc_card_wallets_link";
    const { stripe, calls } = captureStripe({ ...CARD_SCOPED_PMC, link: enabled() });
    await createAxisAchCheckoutSession(stripe, { ...baseInput, paymentMethod: "card" });
    expect(calls[0]).not.toHaveProperty("payment_method_types");
    expect(calls[0]?.payment_method_configuration).toBe("pmc_card_wallets_link");
  });

  it("rejects a PMC that enables a deferred-payment method (klarna) too", async () => {
    process.env.STRIPE_RESIDENT_CARD_PAYMENT_METHOD_CONFIGURATION = "pmc_card_plus_klarna";
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const { stripe, calls } = captureStripe({ ...CARD_SCOPED_PMC, klarna: enabled() });
    await createAxisAchCheckoutSession(stripe, { ...baseInput, paymentMethod: "card" });
    expect(calls[0]?.payment_method_types).toEqual(["card"]);
    logged.mockRestore();
  });

  // A typo'd / deleted PMC id must not cost a Stripe round-trip plus a
  // console.error on EVERY card checkout — the failure is cached too.
  it("falls back to explicit card when the PMC lookup itself fails, and caches that", async () => {
    process.env.STRIPE_RESIDENT_CARD_PAYMENT_METHOD_CONFIGURATION = "pmc_missing";
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const { stripe, calls, pmcLookups } = captureStripe(new Error("No such payment_method_configuration"));
    await createAxisAchCheckoutSession(stripe, { ...baseInput, paymentMethod: "card" });
    await createAxisAchCheckoutSession(stripe, { ...baseInput, paymentMethod: "card" });
    expect(calls[0]?.payment_method_types).toEqual(["card"]);
    expect(calls[1]?.payment_method_types).toEqual(["card"]);
    expect(calls[0]).not.toHaveProperty("payment_method_configuration");
    expect(pmcLookups).toEqual(["pmc_missing"]);
    expect(logged).toHaveBeenCalledTimes(1);
    logged.mockRestore();
  });

  it("ach stays an explicit bank-only session even when a card PMC is configured", async () => {
    process.env.STRIPE_RESIDENT_CARD_PAYMENT_METHOD_CONFIGURATION = "pmc_card_wallets";
    const { stripe, calls } = captureStripe();
    await createAxisAchCheckoutSession(stripe, { ...baseInput, paymentMethod: "ach" });
    expect(calls[0]?.payment_method_types).toEqual(["us_bank_account"]);
    expect(calls[0]).not.toHaveProperty("payment_method_configuration");
  });
});
