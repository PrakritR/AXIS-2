import { describe, expect, it } from "vitest";
import {
  buildNativeOAuthNavigationUrl,
  resolveNativeOAuthCallbackTarget,
} from "@/lib/auth/complete-native-oauth";
import {
  nativeOAuthSetupHint,
  nativeSupabaseRedirectUrls,
} from "@/lib/auth/native-oauth-redirect-urls";
import { NATIVE_OAUTH_CALLBACK_URL } from "@/lib/auth/native-oauth-callback";

describe("resolveNativeOAuthCallbackTarget", () => {
  const origin = "https://www.axis-seattle-housing.com";

  it("maps custom scheme deep links to /auth/callback", () => {
    expect(
      resolveNativeOAuthCallbackTarget(
        "com.axisseattlehousing.app://auth/callback?code=abc",
        origin,
      ),
    ).toBe("/auth/callback?code=abc");
  });

  it("maps https universal links to callback paths", () => {
    expect(
      resolveNativeOAuthCallbackTarget(
        "https://www.axis-seattle-housing.com/auth/callback?code=abc",
        origin,
      ),
    ).toBe("/auth/callback?code=abc");
    expect(
      resolveNativeOAuthCallbackTarget(
        "https://www.axis-seattle-housing.com/auth/callback/partner-pricing?code=abc",
        origin,
      ),
    ).toBe("/auth/callback/partner-pricing?code=abc");
  });

  it("ignores non-callback URLs", () => {
    expect(resolveNativeOAuthCallbackTarget("https://www.axis-seattle-housing.com/", origin)).toBe(
      null,
    );
    expect(
      resolveNativeOAuthCallbackTarget("https://accounts.google.com/o/oauth2/auth", origin),
    ).toBe(null);
  });
});

describe("buildNativeOAuthNavigationUrl", () => {
  it("preserves callback query params", () => {
    expect(
      buildNativeOAuthNavigationUrl("/auth/callback?code=abc", "https://www.axis-seattle-housing.com"),
    ).toBe("https://www.axis-seattle-housing.com/auth/callback?code=abc");
  });
});

describe("nativeSupabaseRedirectUrls", () => {
  it("includes the primary native callback", () => {
    expect(nativeSupabaseRedirectUrls()).toContain(NATIVE_OAUTH_CALLBACK_URL);
  });

  it("documents setup in the hint", () => {
    expect(nativeOAuthSetupHint()).toContain("com.axisseattlehousing.app://auth/callback");
    expect(nativeOAuthSetupHint()).toContain("/auth/callback");
  });
});
