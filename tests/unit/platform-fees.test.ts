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
  it("applies tier-based Axis rent fees", () => {
    expect(platformFeeCents(10000, "rent", "free")).toBe(50);
    expect(platformFeeCents(10000, "rent", "pro")).toBe(25);
    expect(platformFeeCents(10000, "rent", "business")).toBe(0);
    expect(platformFeeCents(0, "rent", "pro")).toBe(0);
    expect(platformFeeCents(-100, "rent", "pro")).toBe(0);
  });

  it("returns display percents", () => {
    expect(platformFeeDisplayPercents("pro")).toEqual({ applicationFee: 0.25, rent: 0.25 });
    expect(platformFeeDisplayPercents("business")).toEqual({ applicationFee: 0, rent: 0 });
  });

  it("returns plan copy for pricing cards", () => {
    expect(axisResidentPaymentFeePlanLine("free")).toContain("0.5%");
    expect(axisResidentPaymentFeePlanLine("business")).toContain("No Axis fee");
  });
});

describe("resident payment fees", () => {
  it("charges lower ACH processing than card", () => {
    expect(residentProcessingFeeCents(10000, "ach")).toBe(80);
    expect(residentProcessingFeeCents(10000, "card")).toBe(320);
  });

  it("combines processing and Axis tier fees for Connect", () => {
    expect(residentConnectApplicationFeeCents(10000, "ach", "free")).toBe(130);
    expect(residentConnectApplicationFeeCents(10000, "card", "business")).toBe(320);
  });
});
