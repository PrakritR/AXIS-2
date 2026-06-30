import { describe, expect, it } from "vitest";
import { isAuthCallbackUrl } from "@/lib/native/open-url";

describe("isAuthCallbackUrl", () => {
  it("matches Supabase OAuth callback paths", () => {
    expect(isAuthCallbackUrl("https://www.axis-seattle-housing.com/auth/callback?code=abc")).toBe(true);
    expect(isAuthCallbackUrl("https://www.axis-seattle-housing.com/auth/callback/partner-pricing")).toBe(
      true,
    );
    expect(isAuthCallbackUrl("https://accounts.google.com/o/oauth2/auth")).toBe(false);
    expect(isAuthCallbackUrl("https://www.axis-seattle-housing.com/auth/sign-in")).toBe(false);
  });
});
