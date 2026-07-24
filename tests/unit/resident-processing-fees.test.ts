import { describe, expect, it } from "vitest";
import {
  achProcessingFeeCents,
  achPlatformRecoupCents,
  AXIS_ACH_FEE_PERCENT,
  axisAchFeeDisplayLabel,
  managerAbsorbedPaymentFeeCents,
  residentAxisPlatformFeeCents,
  residentConnectApplicationFeeCents,
  residentPaymentMethodsSummary,
  residentProcessingFeeCents,
  residentProcessingFeeDisplayLabel,
  type ResidentAxisPaymentMethod,
} from "@/lib/payment-policy";

// PropLane absorbs Stripe's processing cost on resident/applicant payments, so
// the payer is charged EXACTLY the subtotal on every method and the manager
// still receives the full subtotal. Mechanically: the charge is a Connect
// destination charge created on PropLane's platform account with NO
// application_fee_amount, so Stripe debits its fee from PropLane's balance
// while the whole subtotal transfers to the manager.

describe("residents and applicants pay face value on every method", () => {
  const methods: ResidentAxisPaymentMethod[] = ["ach", "card", "link"];
  const subtotals = [100, 5_000, 10_000, 62_500, 100_000, 200_000, 499_900];

  it("no processing fee is ever added, on any method or amount", () => {
    for (const method of methods) {
      for (const subtotal of subtotals) {
        expect(residentProcessingFeeCents(subtotal, method)).toBe(0);
      }
      expect(residentProcessingFeeCents(0, method)).toBe(0);
      expect(residentProcessingFeeCents(-5, method)).toBe(0);
    }
  });

  it("achProcessingFeeCents (and its legacy alias) is 0 — PropLane absorbs the bank cost", () => {
    expect(achProcessingFeeCents(10_000)).toBe(0);
    expect(achProcessingFeeCents(200_000)).toBe(0);
    expect(achProcessingFeeCents(0)).toBe(0);
    expect(achProcessingFeeCents(-5)).toBe(0);
    expect(achPlatformRecoupCents(10_000)).toBe(0);
    expect(AXIS_ACH_FEE_PERCENT).toBe(0);
  });

  it("the manager never absorbs any processing fee either", () => {
    expect(managerAbsorbedPaymentFeeCents()).toBe(0);
  });

  it("the Connect application fee is 0, which is what makes PropLane the fee-bearer", () => {
    const tiers: (string | null)[] = ["free", "pro", "business", null];
    for (const method of methods) {
      for (const tier of tiers) {
        for (const subtotal of subtotals) {
          expect(residentConnectApplicationFeeCents(subtotal, method, tier)).toBe(0);
        }
      }
    }
  });

  it("discloses no fee in any per-method label or summary copy", () => {
    for (const method of methods) {
      expect(residentProcessingFeeDisplayLabel(method)).toBe("No added fees");
    }
    expect(axisAchFeeDisplayLabel()).toBe("No added fees");
    const summary = residentPaymentMethodsSummary({ axisPaymentsEnabled: true }).join(" ");
    expect(summary).toContain("no added fees");
    expect(summary).not.toMatch(/processing fee/i);
  });
});

describe("payer charged == subtotal == manager payout, on every method", () => {
  const methods: ResidentAxisPaymentMethod[] = ["ach", "card", "link"];
  const tiers: (string | null)[] = ["free", "pro", "business", null];
  const subtotals = [100, 5_000, 10_000, 62_500, 200_000, 499_900];

  for (const method of methods) {
    for (const tier of tiers) {
      for (const subtotal of subtotals) {
        it(`face value + full payout for ${method} @ $${(subtotal / 100).toFixed(2)} (tier=${tier ?? "none"})`, () => {
          // Mirror createAxisAchCheckoutSession's composition:
          const processing = residentProcessingFeeCents(subtotal, method);
          const axisFee = residentAxisPlatformFeeCents(subtotal, tier);
          const totalChargedToPayer = subtotal + processing + axisFee;
          const applicationFee = residentConnectApplicationFeeCents(subtotal, method, tier);
          const managerPayout = totalChargedToPayer - applicationFee;

          // The payer is charged exactly face value — never a cent more.
          expect(totalChargedToPayer).toBe(subtotal);
          // Nothing is retained by PropLane, so the whole subtotal transfers out.
          expect(applicationFee).toBe(0);
          expect(managerPayout).toBe(subtotal);
          // Integer cents end to end.
          expect(Number.isInteger(totalChargedToPayer)).toBe(true);
          expect(Number.isInteger(managerPayout)).toBe(true);
        });
      }
    }
  }
});
