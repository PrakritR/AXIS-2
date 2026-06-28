import { describe, expect, it } from "vitest";
import { partnerPricingOAuthCallbackUrl, residentSignupOAuthCallbackUrl } from "@/lib/auth/oauth-redirect";

describe("oauth fixed callback urls", () => {
  it("builds partner pricing callback", () => {
    expect(partnerPricingOAuthCallbackUrl("https://axis.example.com")).toBe(
      "https://axis.example.com/auth/callback/partner-pricing",
    );
  });

  it("builds resident signup callback", () => {
    expect(residentSignupOAuthCallbackUrl("http://localhost:3000")).toBe(
      "http://localhost:3000/auth/callback/resident-signup",
    );
  });
});
