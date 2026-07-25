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
  it("residents pay no fee on any method — PropLane absorbs processing", () => {
    expect(residentProcessingFeeCents(10000, "ach")).toBe(0);
    expect(residentProcessingFeeCents(10000, "card")).toBe(0);
    expect(residentProcessingFeeCents(10000, "link")).toBe(0);
  });

  it("retains nothing from the charge — application fee is 0 on every tier", () => {
    expect(residentConnectApplicationFeeCents(10000, "ach", "free")).toBe(0);
    expect(residentConnectApplicationFeeCents(10000, "card", "business")).toBe(0);
  });
});
