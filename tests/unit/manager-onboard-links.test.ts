import { describe, expect, it } from "vitest";
import {
  buildManagerOnboardPath,
  buildManagerOnboardUrl,
  buildManagerPricingPath,
  buildOnboardOfferSearchParams,
  isManagerOnboardTier,
  parseOnboardOfferSearchParams,
} from "@/lib/manager-onboard-links";

describe("manager-onboard-links offer params", () => {
  it("builds onboard path with discount and billing", () => {
    expect(
      buildManagerOnboardPath("pro", { discountPercent: 25, billing: "annual" }),
    ).toBe("/onboard/pro?d=25&billing=annual");
  });

  it("builds pricing path with tier and offer", () => {
    expect(buildManagerPricingPath("business", { discountPercent: 100 })).toBe(
      "/partner/pricing?tier=business&d=100",
    );
  });

  it("builds full onboard URL with origin", () => {
    expect(
      buildManagerOnboardUrl("https://axis.example", "pro", { discountPercent: 15 }),
    ).toBe("https://axis.example/onboard/pro?d=15");
  });

  it("omits query string when offer is empty", () => {
    expect(buildManagerOnboardPath("free")).toBe("/onboard/free");
    expect(buildManagerPricingPath("free")).toBe("/partner/pricing?tier=free");
  });

  it("clamps discount to 1–100 in search params", () => {
    const params = buildOnboardOfferSearchParams({ discountPercent: 150 });
    expect(params.get("d")).toBe("100");
  });

  it("parses offer search params", () => {
    const params = new URLSearchParams("tier=pro&d=30&billing=monthly&promo=FREEFIRST");
    expect(parseOnboardOfferSearchParams(params)).toEqual({
      discountPercent: 30,
      billing: "monthly",
      promo: "FREEFIRST",
    });
  });

  it("parses offer from record-style search params", () => {
    expect(
      parseOnboardOfferSearchParams({ d: "50", billing: "annual", promo: ["CODE"] }),
    ).toEqual({
      discountPercent: 50,
      billing: "annual",
      promo: "CODE",
    });
  });

  it("ignores invalid discount values", () => {
    expect(parseOnboardOfferSearchParams(new URLSearchParams("d=0"))).toEqual({});
    expect(parseOnboardOfferSearchParams(new URLSearchParams("d=abc"))).toEqual({});
  });

  it("validates manager onboard tiers", () => {
    expect(isManagerOnboardTier("pro")).toBe(true);
    expect(isManagerOnboardTier("enterprise")).toBe(false);
  });
});
