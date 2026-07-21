import { describe, expect, it } from "vitest";
import {
  achProcessingFeeCents,
  achPlatformRecoupCents,
  managerAbsorbedPaymentFeeCents,
  residentAxisPlatformFeeCents,
  residentConnectApplicationFeeCents,
  residentProcessingFeeCents,
  residentProcessingFeeDisplayLabel,
  type ResidentAxisPaymentMethod,
} from "@/lib/payment-policy";

// The resident always covers the payment processing/service fee (card, Link, AND
// bank/ACH). The fee is added on top of the charge as a visible line item and is
// recovered from the checkout total via the Connect application_fee_amount, so
// the manager's payout is the full charge subtotal on every method.

describe("resident processing fees (resident pays, manager kept whole)", () => {
  it("bank transfers pass through Stripe's real ACH cost: 0.8% capped at $5", () => {
    expect(residentProcessingFeeCents(10_000, "ach")).toBe(80); // $100 → 80¢
    expect(residentProcessingFeeCents(5_000, "ach")).toBe(40); // $50 → 40¢
    expect(residentProcessingFeeCents(62_500, "ach")).toBe(500); // exactly at cap
    expect(residentProcessingFeeCents(200_000, "ach")).toBe(500); // $2,000 → capped $5
    expect(residentProcessingFeeCents(0, "ach")).toBe(0);
    expect(residentProcessingFeeCents(-5, "ach")).toBe(0);
    expect(residentProcessingFeeDisplayLabel("ach")).toBe("0.8% bank processing (max $5.00)");
  });

  it("card/link pass-through is unchanged (2.9% + 30¢)", () => {
    expect(residentProcessingFeeCents(100_000, "card")).toBe(2_930);
    expect(residentProcessingFeeCents(100_000, "link")).toBe(2_930);
    expect(residentProcessingFeeCents(10_000, "card")).toBe(320);
  });

  it("achProcessingFeeCents mirrors Stripe's real cost: 0.8% capped at $5", () => {
    expect(achProcessingFeeCents(10_000)).toBe(80);
    expect(achProcessingFeeCents(62_500)).toBe(500);
    expect(achProcessingFeeCents(200_000)).toBe(500);
    expect(achProcessingFeeCents(0)).toBe(0);
    expect(achProcessingFeeCents(-5)).toBe(0);
  });

  it("legacy achPlatformRecoupCents alias still resolves to the ACH cost", () => {
    expect(achPlatformRecoupCents(10_000)).toBe(80);
    expect(achPlatformRecoupCents(200_000)).toBe(500);
  });

  it("the manager never absorbs any processing fee", () => {
    expect(managerAbsorbedPaymentFeeCents()).toBe(0);
  });

  it("Connect application fee equals exactly what the resident pays on top (processing + tier fee)", () => {
    // Platform rent take is 0 for every tier, so the Connect fee IS the resident processing pass-through.
    expect(residentConnectApplicationFeeCents(200_000, "ach")).toBe(500);
    expect(residentConnectApplicationFeeCents(10_000, "ach")).toBe(80);
    expect(residentConnectApplicationFeeCents(100_000, "card")).toBe(2_930);
    expect(residentConnectApplicationFeeCents(100_000, "link")).toBe(2_930);
  });
});

describe("manager is kept whole on every payment method", () => {
  const methods: ResidentAxisPaymentMethod[] = ["ach", "card", "link"];
  const tiers: (string | null)[] = ["free", "pro", "business", null];
  const subtotals = [100, 5_000, 10_000, 62_500, 200_000, 499_900];

  for (const method of methods) {
    for (const tier of tiers) {
      for (const subtotal of subtotals) {
        it(`payout == subtotal for ${method} @ $${(subtotal / 100).toFixed(2)} (tier=${tier ?? "none"})`, () => {
          // Mirror createAxisAchCheckoutSession's composition:
          const processing = residentProcessingFeeCents(subtotal, method);
          const axisFee = residentAxisPlatformFeeCents(subtotal, tier);
          const totalChargedToResident = subtotal + processing + axisFee;
          const applicationFee = residentConnectApplicationFeeCents(subtotal, method, tier);
          const managerPayout = totalChargedToResident - applicationFee;

          // Manager receives the full charge amount; the fee is borne by the resident.
          expect(managerPayout).toBe(subtotal);
          // The application fee is exactly the resident's add-on, never more.
          expect(applicationFee).toBe(processing + axisFee);
          // Resident pays at least the subtotal, and strictly more whenever a fee applies.
          expect(totalChargedToResident).toBeGreaterThanOrEqual(subtotal);
          expect(processing).toBeGreaterThan(0);
        });
      }
    }
  }
});
