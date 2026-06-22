import { describe, expect, it } from "vitest";
import {
  connectAccountReadyForAchPayouts,
  connectAccountTransfersActive,
  managerConnectValidationError,
} from "@/lib/stripe-connect";
import type Stripe from "stripe";

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
