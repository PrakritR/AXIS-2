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

  it("plan copy states no PropLane fee on every tier", () => {
    expect(axisResidentPaymentFeePlanLine("free")).toContain("No PropLane fee");
    expect(axisResidentPaymentFeePlanLine("business")).toContain("No PropLane fee");
  });
});

describe("resident payment fees", () => {
  it("bank transfers are free to the resident; card keeps its pass-through", () => {
    expect(residentProcessingFeeCents(10000, "ach")).toBe(0);
    expect(residentProcessingFeeCents(10000, "card")).toBe(320);
  });

  it("charges processing only — no PropLane platform fee on any tier", () => {
    // Free tier no longer adds a platform fee: ACH processing (80) + 0 = 80.
    expect(residentConnectApplicationFeeCents(10000, "ach", "free")).toBe(80);
    expect(residentConnectApplicationFeeCents(10000, "card", "business")).toBe(320);
  });
});
