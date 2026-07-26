import { describe, expect, it } from "vitest";
import { stripeSetupStateFromStatus } from "@/lib/stripe-setup-state";

// The Payment setup modal must tell the truth about Stripe: "Connected" is shown
// ONLY when the account can actually receive money, and an account that exists
// but hasn't cleared onboarding reads as "incomplete" (not "connected", not
// "unlinked"). These map the live /api/stripe/connect/status shapes.
describe("stripeSetupStateFromStatus", () => {
  it("ready only when Stripe reports the account can receive money", () => {
    expect(stripeSetupStateFromStatus({ paymentReady: true })).toBe("ready");
    expect(
      stripeSetupStateFromStatus({ payoutsEnabled: true, chargesEnabled: true, connected: true }),
    ).toBe("ready");
  });

  it("incomplete when an account exists but is not yet payout-ready", () => {
    // Account created, onboarding started, but transfers/payouts not enabled.
    expect(
      stripeSetupStateFromStatus({ connected: true, accountId: "acct_1", payoutsEnabled: false, paymentReady: false }),
    ).toBe("incomplete");
    expect(stripeSetupStateFromStatus({ accountId: "acct_1" })).toBe("incomplete");
  });

  it("never shows 'ready' for a connected-but-not-payout-enabled account", () => {
    // charges enabled but payouts not — cannot actually receive money to a bank.
    expect(
      stripeSetupStateFromStatus({ connected: true, chargesEnabled: true, payoutsEnabled: false }),
    ).toBe("incomplete");
  });

  it("unlinked when there is no connected account at all", () => {
    expect(stripeSetupStateFromStatus({ connected: false, accountId: null })).toBe("unlinked");
    expect(stripeSetupStateFromStatus({})).toBe("unlinked");
  });
});
