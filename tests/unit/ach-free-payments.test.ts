import { describe, expect, it } from "vitest";
import {
  achPlatformRecoupCents,
  residentConnectApplicationFeeCents,
  residentProcessingFeeCents,
  residentProcessingFeeDisplayLabel,
} from "@/lib/payment-policy";

describe("free ACH for residents", () => {
  it("residents pay zero processing on bank transfers", () => {
    expect(residentProcessingFeeCents(200_000, "ach")).toBe(0);
    expect(residentProcessingFeeCents(5_000, "ach")).toBe(0);
    expect(residentProcessingFeeDisplayLabel("ach")).toBe("Free");
  });

  it("card/link pass-through is unchanged (2.9% + 30¢)", () => {
    expect(residentProcessingFeeCents(100_000, "card")).toBe(2_930);
    expect(residentProcessingFeeCents(100_000, "link")).toBe(2_930);
  });

  it("achPlatformRecoupCents mirrors Stripe's real cost: 0.8% capped at $5", () => {
    expect(achPlatformRecoupCents(10_000)).toBe(80); // $100 rent → 80¢
    expect(achPlatformRecoupCents(62_500)).toBe(500); // exactly at cap
    expect(achPlatformRecoupCents(200_000)).toBe(500); // $2,000 rent → capped $5
    expect(achPlatformRecoupCents(0)).toBe(0);
    expect(achPlatformRecoupCents(-5)).toBe(0);
  });

  it("Connect application fee on ACH recoups the capped cost from the payout, never from the resident", () => {
    // Platform rent take is 0 for every tier, so the Connect fee IS the recoup.
    expect(residentConnectApplicationFeeCents(200_000, "ach")).toBe(500);
    expect(residentConnectApplicationFeeCents(10_000, "ach")).toBe(80);
    // Card keeps the resident pass-through as the recovered amount.
    expect(residentConnectApplicationFeeCents(100_000, "card")).toBe(2_930);
  });
});
