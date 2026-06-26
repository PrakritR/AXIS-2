import { describe, expect, it } from "vitest";
import { authCallbackUrl, oauthContinuePath, usesDirectOAuthReturn } from "@/lib/auth/oauth-redirect";

describe("oauth redirect helpers", () => {
  it("builds continue path with safe next route", () => {
    expect(oauthContinuePath("/portal/dashboard")).toBe("/auth/continue?next=%2Fportal%2Fdashboard");
    expect(oauthContinuePath("")).toBe("/auth/continue");
  });

  it("builds callback url for Supabase OAuth", () => {
    expect(authCallbackUrl("https://axis.example.com", "/auth/continue")).toBe(
      "https://axis.example.com/auth/callback?next=%2Fauth%2Fcontinue",
    );
  });

  it("detects manager signup routes that skip /auth/continue", () => {
    expect(usesDirectOAuthReturn("/auth/manager-pricing-oauth?tier=pro&billing=monthly")).toBe(true);
    expect(usesDirectOAuthReturn("/auth/manager-oauth-finish?session_id=cs_test")).toBe(true);
    expect(usesDirectOAuthReturn("/portal/dashboard")).toBe(false);
  });
});
