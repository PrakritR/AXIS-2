import { describe, expect, it } from "vitest";
import {
  isManagerPurchasePeriodExpired,
  isSignupTrialManagerPurchase,
  managerPurchasePeriodEndMs,
  resolveEffectiveManagerTier,
} from "@/lib/manager-tier-expiry";
import { MANAGER_SUBSCRIPTION_TRIAL_DAYS } from "@/lib/stripe/subscription-checkout-session";

describe("manager-tier-expiry", () => {
  const paidAt = "2026-01-15T12:00:00.000Z";

  it("treats monthly admin grants as expired after one month", () => {
    const input = {
      tier: "business",
      billing: "monthly",
      paid_at: paidAt,
      stripe_subscription_id: null,
    };
    const endMs = managerPurchasePeriodEndMs(input);
    expect(endMs).not.toBeNull();
    expect(isManagerPurchasePeriodExpired(input, endMs! + 1)).toBe(true);
    expect(resolveEffectiveManagerTier(input, endMs! + 1)).toBe("free");
  });

  it("treats annual admin grants as expired after one year", () => {
    const input = {
      tier: "pro",
      billing: "annual",
      paid_at: paidAt,
      stripe_subscription_id: null,
    };
    const endMs = managerPurchasePeriodEndMs(input);
    expect(endMs).not.toBeNull();
    expect(isManagerPurchasePeriodExpired(input, endMs! + 1)).toBe(true);
    expect(resolveEffectiveManagerTier(input, endMs! - 1)).toBe("pro");
  });

  it("does not grant paid access for portal billing without Stripe subscription id", () => {
    const input = {
      tier: "business",
      billing: "portal",
      paid_at: paidAt,
      stripe_subscription_id: null,
    };
    expect(isManagerPurchasePeriodExpired(input, Date.parse("2030-01-01T00:00:00.000Z"))).toBe(false);
    expect(resolveEffectiveManagerTier(input, Date.parse("2030-01-01T00:00:00.000Z"))).toBe("business");
  });

  it("does not apply paid_at expiry when Stripe manages the subscription", () => {
    const input = {
      tier: "business",
      billing: "monthly",
      paid_at: paidAt,
      stripe_subscription_id: "sub_123",
    };
    expect(isManagerPurchasePeriodExpired(input, Date.parse("2030-01-01T00:00:00.000Z"))).toBe(false);
    expect(resolveEffectiveManagerTier(input, Date.parse("2030-01-01T00:00:00.000Z"))).toBe("business");
  });

  it("treats signup trial grants as expired after trial days", () => {
    const input = {
      tier: "pro",
      billing: "trial",
      paid_at: paidAt,
      stripe_subscription_id: null,
    };
    expect(isSignupTrialManagerPurchase("trial")).toBe(true);
    const endMs = managerPurchasePeriodEndMs(input);
    expect(endMs).not.toBeNull();
    expect(isManagerPurchasePeriodExpired(input, endMs! - 1)).toBe(false);
    expect(resolveEffectiveManagerTier(input, endMs! - 1)).toBe("pro");
    expect(isManagerPurchasePeriodExpired(input, endMs! + 1)).toBe(true);
    expect(resolveEffectiveManagerTier(input, endMs! + 1)).toBe("free");
    const trialDaysMs = MANAGER_SUBSCRIPTION_TRIAL_DAYS * 24 * 60 * 60 * 1000;
    expect(endMs! - Date.parse(paidAt)).toBe(trialDaysMs);
  });
});
