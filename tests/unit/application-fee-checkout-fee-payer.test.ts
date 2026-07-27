import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

// Locks in the money-path rules for the rental application fee:
//  1. The fee is routed to the property's OWNING manager's Connect account —
//     never the platform account, and never a manager id the client merely claims.
//  2. Who bears the service fee now follows the SAME plan-based resolver resident
//     charges use (Free = applicant pays it, Pro = manager's setting, Business =
//     PropLane absorbs) — this supersedes the old "always face value" carve-out.

vi.mock("@/lib/stripe-axis-ach-checkout", async () => {
  const actual = await vi.importActual<typeof import("@/lib/stripe-axis-ach-checkout")>(
    "@/lib/stripe-axis-ach-checkout",
  );
  return { ...actual, createAxisAchCheckoutSession: vi.fn() };
});

vi.mock("@/lib/manager-access-server", () => ({
  getManagerPurchaseSku: vi.fn(),
}));

vi.mock("@/lib/manager-manual-payment-settings", () => ({
  loadManagerManualPaymentSettings: vi.fn(),
}));

import { createAxisAchCheckoutSession } from "@/lib/stripe-axis-ach-checkout";
import { getManagerPurchaseSku } from "@/lib/manager-access-server";
import { loadManagerManualPaymentSettings } from "@/lib/manager-manual-payment-settings";
import {
  createApplicationFeeCheckout,
  resolveApplicationFeeItemization,
  resolveApplicationFeeProperty,
} from "@/lib/application-fee-checkout.server";

function makeStripe(account: Partial<Stripe.Account>): Stripe {
  const acct = { id: account.id ?? "acct_unset", object: "account", ...account } as Stripe.Account;
  return {
    accounts: { retrieve: vi.fn().mockResolvedValue(acct), update: vi.fn().mockResolvedValue(acct) },
  } as unknown as Stripe;
}

function makeDb(opts: {
  managerUserId: string;
  managerAccountId: string | null;
  applicationFee?: string;
  holdingDeposit?: string;
  holdingDepositTiming?: "at_application" | "after_approval";
}): SupabaseClient {
  const from = (table: string) => {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.maybeSingle = async () => {
      if (table === "manager_property_records") {
        return {
          data: {
            manager_user_id: opts.managerUserId,
            property_data: {
              listingSubmission: {
                v: 1,
                applicationFee: opts.applicationFee ?? "$50",
                holdingDeposit: opts.holdingDeposit ?? "",
                holdingDepositTiming: opts.holdingDepositTiming ?? "after_approval",
                axisPaymentsEnabled: true,
                rooms: [],
                bathrooms: [],
              },
            },
          },
          error: null,
        };
      }
      if (table === "profiles") {
        return { data: { stripe_connect_account_id: opts.managerAccountId }, error: null };
      }
      return { data: null, error: null };
    };
    return chain;
  };
  return { from } as unknown as SupabaseClient;
}

const baseInput = {
  propertyId: "prop_1",
  residentEmail: "applicant@example.com",
  managerUserId: "mgr_A",
  successUrl: "https://app.test/success",
  cancelUrl: "https://app.test/cancel",
};

describe("createApplicationFeeCheckout — destination + ownership", () => {
  beforeEach(() => {
    vi.mocked(createAxisAchCheckoutSession).mockReset();
    vi.mocked(createAxisAchCheckoutSession).mockResolvedValue({
      mode: "hosted",
      url: "https://checkout.stripe.com/session",
      sessionId: "cs_1",
      subtotalCents: 5000,
      processingFeeCents: 0,
      axisFeeCents: 0,
      totalCents: 5000,
      platformFeeCents: 0,
      paymentMethod: "card",
    });
    vi.mocked(getManagerPurchaseSku).mockResolvedValue({
      tier: "free",
      billing: null,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      appleOriginalTransactionId: null,
    });
    vi.mocked(loadManagerManualPaymentSettings).mockResolvedValue({
      zellePaymentsEnabled: false,
      zelleContact: "",
      venmoPaymentsEnabled: false,
      venmoContact: "",
      receiptAutoMarkEnabled: true,
      serviceFeePayer: "resident",
    });
  });

  it("routes the charge to the manager's OWN connected account", async () => {
    const stripe = makeStripe({ id: "acct_manager_A", capabilities: { transfers: "active" }, payouts_enabled: true });
    const db = makeDb({ managerUserId: "mgr_A", managerAccountId: "acct_manager_A" });

    const result = await createApplicationFeeCheckout(db, stripe, baseInput);

    expect(result.ok).toBe(true);
    const passed = vi.mocked(createAxisAchCheckoutSession).mock.calls[0]?.[1] as { destinationAccountId?: string };
    expect(passed.destinationAccountId).toBe("acct_manager_A");
  });

  it("REJECTS when the client-supplied managerUserId does not own the property", async () => {
    const stripe = makeStripe({ id: "acct_manager_A" });
    const db = makeDb({ managerUserId: "mgr_REAL_OWNER", managerAccountId: "acct_manager_A" });

    const result = await createApplicationFeeCheckout(db, stripe, { ...baseInput, managerUserId: "mgr_ATTACKER" });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
    expect(createAxisAchCheckoutSession).not.toHaveBeenCalled();
  });

  it("BLOCKS the fee when the manager has not connected Stripe payouts", async () => {
    const stripe = makeStripe({ id: "acct_platform" });
    const db = makeDb({ managerUserId: "mgr_A", managerAccountId: null });

    const result = await createApplicationFeeCheckout(db, stripe, baseInput);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("MANAGER_NO_CONNECT_ACCOUNT");
    expect(createAxisAchCheckoutSession).not.toHaveBeenCalled();
  });

  it("never falls back to the fee amount the client supplies — always the server-stored listing fee", async () => {
    const stripe = makeStripe({ id: "acct_manager_A", capabilities: { transfers: "active" }, payouts_enabled: true });
    const db = makeDb({ managerUserId: "mgr_A", managerAccountId: "acct_manager_A", applicationFee: "$75" });

    await createApplicationFeeCheckout(db, stripe, baseInput);

    const passed = vi.mocked(createAxisAchCheckoutSession).mock.calls[0]?.[1] as {
      lineItems?: { amountCents: number }[];
    };
    // Fee-only checkout (no holding deposit configured on this listing) is a
    // single line item for the application fee.
    expect(passed.lineItems).toHaveLength(1);
    expect(passed.lineItems?.[0]?.amountCents).toBe(7500);
  });

  it("BLOCKS Stripe checkout when the listing has card/ACH payments disabled", async () => {
    const stripe = makeStripe({ id: "acct_manager_A", capabilities: { transfers: "active" }, payouts_enabled: true });
    const db: SupabaseClient = {
      from: (table: string) => {
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.maybeSingle = async () => {
          if (table === "manager_property_records") {
            return {
              data: {
                manager_user_id: "mgr_A",
                property_data: {
                  listingSubmission: {
                    v: 1,
                    applicationFee: "$50",
                    axisPaymentsEnabled: false,
                    zellePaymentsEnabled: true,
                    zelleContact: "manager@example.com",
                    rooms: [],
                    bathrooms: [],
                  },
                },
              },
              error: null,
            };
          }
          return { data: null, error: null };
        };
        return chain;
      },
    } as unknown as SupabaseClient;

    const result = await createApplicationFeeCheckout(db, stripe, baseInput);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("AXIS_PAYMENTS_DISABLED");
  });
});

describe("createApplicationFeeCheckout — manager's per-listing pay-at-application deposit choice", () => {
  beforeEach(() => {
    vi.mocked(createAxisAchCheckoutSession).mockReset();
    vi.mocked(createAxisAchCheckoutSession).mockResolvedValue({
      mode: "hosted",
      url: "https://checkout.stripe.com/session",
      sessionId: "cs_1",
      subtotalCents: 15000,
      processingFeeCents: 0,
      axisFeeCents: 0,
      totalCents: 15000,
      platformFeeCents: 0,
      paymentMethod: "card",
    });
    vi.mocked(getManagerPurchaseSku).mockResolvedValue({
      tier: "business",
      billing: null,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      appleOriginalTransactionId: null,
    });
    vi.mocked(loadManagerManualPaymentSettings).mockResolvedValue({
      zellePaymentsEnabled: false,
      zelleContact: "",
      venmoPaymentsEnabled: false,
      venmoContact: "",
      receiptAutoMarkEnabled: true,
      serviceFeePayer: "resident",
    });
  });

  it("defaults to after_approval — a $100 deposit is never folded into the fee-only checkout", async () => {
    const stripe = makeStripe({ id: "acct_manager_A", capabilities: { transfers: "active" }, payouts_enabled: true });
    const db = makeDb({
      managerUserId: "mgr_A",
      managerAccountId: "acct_manager_A",
      applicationFee: "$50",
      holdingDeposit: "$100",
      // holdingDepositTiming intentionally omitted from makeDb's default (after_approval)
    });

    const result = await createApplicationFeeCheckout(db, stripe, baseInput);

    expect(result.ok).toBe(true);
    const passed = vi.mocked(createAxisAchCheckoutSession).mock.calls[0]?.[1] as {
      lineItems?: { amountCents: number }[];
    };
    expect(passed.lineItems).toHaveLength(1);
    expect(passed.lineItems?.[0]?.amountCents).toBe(5000);
    if (result.ok) {
      expect(result.itemization.holdingDepositCents).toBe(0);
      expect(result.itemization.totalCents).toBe(5000);
    }
  });

  it("combines $50 fee + $100 deposit into ONE session (two line items) when the manager opts into at_application", async () => {
    const stripe = makeStripe({ id: "acct_manager_A", capabilities: { transfers: "active" }, payouts_enabled: true });
    const db = makeDb({
      managerUserId: "mgr_A",
      managerAccountId: "acct_manager_A",
      applicationFee: "$50",
      holdingDeposit: "$100",
      holdingDepositTiming: "at_application",
    });

    const result = await createApplicationFeeCheckout(db, stripe, baseInput);

    expect(result.ok).toBe(true);
    expect(createAxisAchCheckoutSession).toHaveBeenCalledTimes(1);
    const passed = vi.mocked(createAxisAchCheckoutSession).mock.calls[0]?.[1] as {
      lineItems?: { amountCents: number; productName: string }[];
      metadata?: Record<string, string>;
    };
    expect(passed.lineItems).toEqual([
      expect.objectContaining({ amountCents: 5000, productName: "Rental application fee" }),
      expect.objectContaining({ amountCents: 10000, productName: "Holding deposit" }),
    ]);
    expect(passed.metadata?.includes_holding_deposit).toBe("true");
    expect(passed.metadata?.holding_deposit_cents).toBe("10000");
    if (result.ok) {
      expect(result.itemization.applicationFeeCents).toBe(5000);
      expect(result.itemization.holdingDepositCents).toBe(10000);
      // Business tier: PropLane absorbs the service fee, so total = fee + deposit face value.
      expect(result.itemization.totalCents).toBe(15000);
    }
  });

  it("charges the deposit ALONE (fee dropped from the session) when the fee was already waived by a redeemed code", async () => {
    const stripe = makeStripe({ id: "acct_manager_A", capabilities: { transfers: "active" }, payouts_enabled: true });
    const db = makeDb({
      managerUserId: "mgr_A",
      managerAccountId: "acct_manager_A",
      applicationFee: "$50",
      holdingDeposit: "$100",
      holdingDepositTiming: "at_application",
    });

    const result = await createApplicationFeeCheckout(db, stripe, { ...baseInput, feeWaived: true });

    expect(result.ok).toBe(true);
    const passed = vi.mocked(createAxisAchCheckoutSession).mock.calls[0]?.[1] as {
      lineItems?: { amountCents: number; productName: string }[];
    };
    expect(passed.lineItems).toEqual([expect.objectContaining({ amountCents: 10000, productName: "Holding deposit" })]);
    if (result.ok) {
      expect(result.itemization.applicationFeeCents).toBe(0);
      expect(result.itemization.holdingDepositCents).toBe(10000);
    }
  });

  it("refuses checkout when there is nothing left to charge (fee waived, no deposit at application)", async () => {
    const stripe = makeStripe({ id: "acct_manager_A", capabilities: { transfers: "active" }, payouts_enabled: true });
    const db = makeDb({
      managerUserId: "mgr_A",
      managerAccountId: "acct_manager_A",
      applicationFee: "$50",
      holdingDeposit: "$100",
      holdingDepositTiming: "after_approval",
    });

    const result = await createApplicationFeeCheckout(db, stripe, { ...baseInput, feeWaived: true });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("NOTHING_DUE");
    expect(createAxisAchCheckoutSession).not.toHaveBeenCalled();
  });
});

describe("resolveApplicationFeeProperty — never requires a Stripe-eligible channel", () => {
  it("still resolves a Zelle/Venmo-only listing (waiver codes + preview must work without ACH)", async () => {
    const db: SupabaseClient = {
      from: (table: string) => {
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.maybeSingle = async () => {
          if (table === "manager_property_records") {
            return {
              data: {
                manager_user_id: "mgr_A",
                property_data: {
                  listingSubmission: {
                    v: 1,
                    applicationFee: "$50",
                    axisPaymentsEnabled: false,
                    rooms: [],
                    bathrooms: [],
                  },
                },
              },
              error: null,
            };
          }
          return { data: null, error: null };
        };
        return chain;
      },
    } as unknown as SupabaseClient;

    const result = await resolveApplicationFeeProperty(db, { propertyId: "prop_1", managerUserId: "mgr_A" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.applicationFeeCents).toBe(5000);
  });
});

describe("resolveApplicationFeeItemization — plan-based service fee resolver", () => {
  const db = {} as SupabaseClient;

  it("Free tier: the applicant bears the service fee", async () => {
    vi.mocked(getManagerPurchaseSku).mockResolvedValue({
      tier: "free",
      billing: null,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      appleOriginalTransactionId: null,
    });
    vi.mocked(loadManagerManualPaymentSettings).mockResolvedValue({
      zellePaymentsEnabled: false,
      zelleContact: "",
      venmoPaymentsEnabled: false,
      venmoContact: "",
      receiptAutoMarkEnabled: true,
      serviceFeePayer: "resident",
    });

    const result = await resolveApplicationFeeItemization(db, "mgr_A", 5000);
    expect(result.feePayer).toBe("resident");
    expect(result.serviceFeeCents).toBeGreaterThan(0);
    expect(result.totalCents).toBe(result.applicationFeeCents + result.serviceFeeCents);
  });

  it("Pro tier + manager absorbs: the applicant pays face value", async () => {
    vi.mocked(getManagerPurchaseSku).mockResolvedValue({
      tier: "pro",
      billing: null,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      appleOriginalTransactionId: null,
    });
    vi.mocked(loadManagerManualPaymentSettings).mockResolvedValue({
      zellePaymentsEnabled: false,
      zelleContact: "",
      venmoPaymentsEnabled: false,
      venmoContact: "",
      receiptAutoMarkEnabled: true,
      serviceFeePayer: "manager",
    });

    const result = await resolveApplicationFeeItemization(db, "mgr_A", 5000);
    expect(result.feePayer).toBe("manager");
    expect(result.serviceFeeCents).toBe(0);
    expect(result.totalCents).toBe(5000);
  });

  it("Business tier: PropLane absorbs, applicant pays face value", async () => {
    vi.mocked(getManagerPurchaseSku).mockResolvedValue({
      tier: "business",
      billing: null,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      appleOriginalTransactionId: null,
    });
    vi.mocked(loadManagerManualPaymentSettings).mockResolvedValue({
      zellePaymentsEnabled: false,
      zelleContact: "",
      venmoPaymentsEnabled: false,
      venmoContact: "",
      receiptAutoMarkEnabled: true,
      serviceFeePayer: "resident",
    });

    const result = await resolveApplicationFeeItemization(db, "mgr_A", 5000);
    expect(result.feePayer).toBe("proplane");
    expect(result.serviceFeeCents).toBe(0);
    expect(result.totalCents).toBe(5000);
  });
});
