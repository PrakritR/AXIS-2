import { describe, expect, it, vi } from "vitest";
import {
  connectAccountReadyForAchPayouts,
  connectAccountTransfersActive,
  managerConnectValidationError,
  resolveAndValidateManagerConnectForPayments,
} from "@/lib/stripe-connect";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

function mockAccount(overrides: Partial<Stripe.Account>): Stripe.Account {
  return {
    id: "acct_test",
    object: "account",
    capabilities: { transfers: "inactive" },
    payouts_enabled: false,
    ...overrides,
  } as Stripe.Account;
}

describe("stripe-connect", () => {
  it("detects active transfers capability", () => {
    expect(connectAccountTransfersActive(mockAccount({ capabilities: { transfers: "active" } }))).toBe(true);
    expect(connectAccountTransfersActive(mockAccount({ capabilities: { transfers: "pending" } }))).toBe(false);
  });

  it("requires transfers and payouts for ACH payout readiness", () => {
    expect(
      connectAccountReadyForAchPayouts(
        mockAccount({ capabilities: { transfers: "active" }, payouts_enabled: true }),
      ),
    ).toBe(true);
    expect(
      connectAccountReadyForAchPayouts(
        mockAccount({ capabilities: { transfers: "active" }, payouts_enabled: false }),
      ),
    ).toBe(false);
  });

  it("returns helpful validation errors", () => {
    expect(managerConnectValidationError(mockAccount({ capabilities: { transfers: "pending" } }))).toMatch(
      /still processing/i,
    );
    expect(managerConnectValidationError(mockAccount({ capabilities: { transfers: "inactive" } }))).toMatch(
      /additional information/i,
    );
  });
});

describe("resolveAndValidateManagerConnectForPayments — the payout-destination gate", () => {
  function dbWithProfileAccount(accountId: string | null): SupabaseClient {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.update = () => chain;
    chain.maybeSingle = async () => ({ data: { stripe_connect_account_id: accountId }, error: null });
    return { from: () => chain } as unknown as SupabaseClient;
  }

  function stripeReturning(account: Partial<Stripe.Account>): Stripe {
    const acct = { id: account.id ?? "acct_x", object: "account", ...account } as Stripe.Account;
    return {
      accounts: {
        retrieve: vi.fn().mockResolvedValue(acct),
        update: vi.fn().mockResolvedValue(acct),
      },
    } as unknown as Stripe;
  }

  it("blocks (NO_ACCOUNT) when the manager has no stored connected account — never falls back to a platform id", async () => {
    const result = await resolveAndValidateManagerConnectForPayments(
      stripeReturning({ id: "acct_platform" }),
      dbWithProfileAccount(null),
      "mgr_new",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("NO_ACCOUNT");
  });

  it("returns the manager's OWN account id when transfers are active", async () => {
    const result = await resolveAndValidateManagerConnectForPayments(
      stripeReturning({ id: "acct_manager_self", capabilities: { transfers: "active" }, payouts_enabled: true }),
      dbWithProfileAccount("acct_manager_self"),
      "mgr_self",
    );
    expect(result).toEqual({ ok: true, accountId: "acct_manager_self" });
  });

  it("blocks (TRANSFERS_NOT_ACTIVE) when onboarding is incomplete", async () => {
    const result = await resolveAndValidateManagerConnectForPayments(
      stripeReturning({ id: "acct_incomplete", capabilities: { transfers: "inactive" }, payouts_enabled: false }),
      dbWithProfileAccount("acct_incomplete"),
      "mgr_incomplete",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("TRANSFERS_NOT_ACTIVE");
  });
});
