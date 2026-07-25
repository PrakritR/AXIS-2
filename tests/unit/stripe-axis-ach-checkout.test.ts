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

  // ── Money path: face value in, full subtotal out, PropLane bears Stripe's fee.
  //
  // These assert the ACTUAL session params, not just the policy helpers: the
  // payer is charged the subtotal and nothing else, `application_fee_amount` is
  // never sent, and the charge is a DESTINATION charge on PropLane's platform
  // account (transfer_data.destination, no on_behalf_of, no Stripe-Account
  // header) — which is what puts Stripe's processing fee on PropLane instead of
  // the manager.
  describe("no fees: payer charged subtotal, manager paid subtotal", () => {
    const methods = ["ach", "card", "link"] as const;
    const tiers = ["free", "pro", "business", null] as const;
    // $1.00 floor, a $0.30-fixed-fee-sensitive amount, the old ACH cap boundary,
    // and a large rent payment.
    const subtotals = [100, 5_000, 62_500, 499_900];

    function lineItemTotal(params: Record<string, unknown>): number {
      const items = params.line_items as { price_data: { unit_amount: number }; quantity: number }[];
      return items.reduce((sum, item) => sum + item.price_data.unit_amount * item.quantity, 0);
    }

    for (const method of methods) {
      for (const tier of tiers) {
        for (const subtotal of subtotals) {
          it(`${method} @ $${(subtotal / 100).toFixed(2)} (tier=${tier ?? "none"})`, async () => {
            const { stripe, calls } = captureStripe();
            const result = await createAxisAchCheckoutSession(stripe, {
              ...baseInput,
              amountCents: subtotal,
              paymentMethod: method,
              managerTier: tier,
            });
            const params = calls[0]!;
            const pid = params.payment_intent_data as Record<string, unknown>;

            // 1. The payer is charged EXACTLY the subtotal: no fee line item.
            expect(lineItemTotal(params)).toBe(subtotal);
            expect((params.line_items as unknown[]).length).toBe(1);
            expect(result.totalCents).toBe(subtotal);
            expect(result.subtotalCents).toBe(subtotal);
            expect(result.processingFeeCents).toBe(0);
            expect(result.axisFeeCents).toBe(0);

            // 2. Nothing is retained, so the FULL subtotal transfers out.
            expect(pid).not.toHaveProperty("application_fee_amount");
            expect(result.platformFeeCents).toBe(0);
            expect(lineItemTotal(params) - 0).toBe(subtotal);

            // 3. Destination charge on the PLATFORM account — PropLane is
            //    merchant of record and therefore bears Stripe's fee.
            expect(pid.transfer_data).toEqual({ destination: "acct_test" });
            expect(pid).not.toHaveProperty("on_behalf_of");

            // 4. The disclosed metadata matches what was charged.
            const metadata = params.metadata as Record<string, string>;
            expect(metadata.subtotal_cents).toBe(String(subtotal));
            expect(metadata.processing_fee_cents).toBe("0");
            expect(metadata.axis_fee_cents).toBe("0");
          });
        }
      }
    }

    it("never emits a processing/service fee line item on a multi-charge session", async () => {
      const { stripe, calls } = captureStripe();
      const result = await createAxisAchCheckoutSession(stripe, {
        ...baseInput,
        amountCents: undefined,
        lineItems: [
          { amountCents: 180_000, productName: "Rent — March" },
          { amountCents: 7_350, productName: "Utilities — March" },
        ],
        paymentMethod: "card",
      });
      const params = calls[0]!;
      const items = params.line_items as { price_data: { product_data: { name: string } } }[];
      expect(items.map((i) => i.price_data.product_data.name)).toEqual(["Rent — March", "Utilities — March"]);
      expect(result.totalCents).toBe(187_350);
      expect(params.payment_intent_data).not.toHaveProperty("application_fee_amount");
    });
  });
});
