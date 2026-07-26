import { describe, expect, it } from "vitest";
import {
  axisResidentPaymentFeePlanLine,
  platformFeeCents,
  platformFeeDisplayPercents,
} from "@/lib/platform-fees";
import {
  residentConnectApplicationFeeCents,
  residentProcessingFeeCents,
} from "@/lib/payment-policy";

describe("platform-fees", () => {
  it("never takes a PropLane fee on any tier", () => {
    // PropLane takes 0% from resident/applicant transactions on every tier.
    expect(platformFeeCents(10000, "rent", "free")).toBe(0);
    expect(platformFeeCents(10000, "rent", "pro")).toBe(0);
    expect(platformFeeCents(10000, "rent", "business")).toBe(0);
    expect(platformFeeCents(10000, "application_fee", "free")).toBe(0);
    expect(platformFeeCents(0, "rent", "pro")).toBe(0);
    expect(platformFeeCents(-100, "rent", "pro")).toBe(0);
  });

  it("returns display percents (0 on every tier)", () => {
    expect(platformFeeDisplayPercents("free")).toEqual({ applicationFee: 0, rent: 0 });
    expect(platformFeeDisplayPercents("pro")).toEqual({ applicationFee: 0, rent: 0 });
    expect(platformFeeDisplayPercents("business")).toEqual({ applicationFee: 0, rent: 0 });
  });

  it("plan copy states no PropLane fee and never advertises a processing charge", () => {
    for (const tier of ["free", "pro", "business"] as const) {
      const line = axisResidentPaymentFeePlanLine(tier);
      expect(line).toContain("No PropLane fee");
      expect(line).toContain("PropLane covers payment processing");
      expect(line).not.toMatch(/residents pay processing/i);
    }
  });
});

describe("resident payment fees", () => {
  it("the service fee is Stripe's real per-method cost", () => {
    expect(residentProcessingFeeCents(10000, "ach")).toBe(80); // 0.8%
    expect(residentProcessingFeeCents(10000, "card")).toBe(320); // 2.9% + $0.30
    expect(residentProcessingFeeCents(10000, "link")).toBe(320);
  });

  it("the retained application fee (resident-pays value) equals the service fee — the 0-bps platform take adds nothing", () => {
    expect(residentConnectApplicationFeeCents(10000, "ach", "free")).toBe(80);
    expect(residentConnectApplicationFeeCents(10000, "card", "business")).toBe(320);
  });
});
