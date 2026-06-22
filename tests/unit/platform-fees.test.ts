import { describe, expect, it } from "vitest";
import { platformFeeCents, platformFeeDisplayPercents } from "@/lib/platform-fees";

describe("platform-fees", () => {
  it("returns zero fees for all tiers currently", () => {
    expect(platformFeeCents(10000, "rent", "pro")).toBe(0);
    expect(platformFeeCents(10000, "application_fee", "business")).toBe(0);
    expect(platformFeeCents(0, "rent", "pro")).toBe(0);
    expect(platformFeeCents(-100, "rent", "pro")).toBe(0);
  });

  it("returns display percents", () => {
    expect(platformFeeDisplayPercents("pro")).toEqual({ applicationFee: 0, rent: 0 });
  });
});
