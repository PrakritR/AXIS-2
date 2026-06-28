import { describe, expect, it } from "vitest";
import { managerPricingOauthPath } from "@/lib/auth/manager-pricing-oauth-path";

describe("managerPricingOauthPath", () => {
  it("builds oauth continue path with tier and offer params", () => {
    expect(managerPricingOauthPath({ tier: "pro", billing: "monthly", discountPercent: 20 })).toBe(
      "/auth/manager-pricing-oauth?tier=pro&billing=monthly&d=20",
    );
    expect(managerPricingOauthPath({ tier: "free", billing: "annual", promo: "FREEFIRST" })).toBe(
      "/auth/manager-pricing-oauth?tier=free&billing=annual&promo=FREEFIRST",
    );
  });
});
