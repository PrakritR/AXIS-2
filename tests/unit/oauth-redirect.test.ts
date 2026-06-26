import { describe, expect, it } from "vitest";
import { authCallbackUrl, oauthContinuePath } from "@/lib/auth/oauth-redirect";

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
});
