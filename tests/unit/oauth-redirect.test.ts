import { describe, expect, it } from "vitest";
import { authCallbackUrl, bareAuthCallbackUrl, oauthContinuePath, partnerPricingOAuthCallbackUrl, usesDirectOAuthReturn } from "@/lib/auth/oauth-redirect";

describe("oauth redirect helpers", () => {
  it("builds continue path with safe next route", () => {
    expect(oauthContinuePath("/portal/dashboard")).toBe("/auth/continue?next=%2Fportal%2Fdashboard");
    expect(oauthContinuePath("")).toBe("/auth/continue");
  });

  it("builds bare callback url without query params for Supabase allowlist", () => {
    expect(bareAuthCallbackUrl("http://localhost:3000")).toBe("http://localhost:3000/auth/callback");
  });

  it("builds callback url for Supabase OAuth", () => {
    expect(authCallbackUrl("https://axis.example.com", "/auth/continue")).toBe(
      "https://axis.example.com/auth/callback?next=%2Fauth%2Fcontinue",
    );
  });

  it("builds partner pricing callback without query params", () => {
    expect(partnerPricingOAuthCallbackUrl("http://localhost:3000")).toBe(
      "http://localhost:3000/auth/callback/partner-pricing",
    );
  });

  it("detects manager signup routes that skip /auth/continue", () => {
    expect(usesDirectOAuthReturn("/auth/manager-pricing-oauth?tier=pro&billing=monthly")).toBe(true);
    expect(usesDirectOAuthReturn("/auth/manager-oauth-finish?session_id=cs_test")).toBe(true);
    expect(usesDirectOAuthReturn("/auth/manager-register-oauth")).toBe(true);
    expect(usesDirectOAuthReturn("/portal/dashboard")).toBe(false);
  });
});
