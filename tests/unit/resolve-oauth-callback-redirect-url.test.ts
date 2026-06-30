import { afterEach, describe, expect, it, vi } from "vitest";
import {
  NATIVE_OAUTH_CALLBACK_URL,
  resolveOAuthCallbackRedirectUrl,
} from "@/lib/auth/native-oauth-callback";
import { NATIVE_OAUTH_BRIDGE_PARAM } from "@/lib/auth/native-oauth-bridge";

/** Stub a native shell (no Capacitor global) tagged via the `data-native` attribute. */
function stubNativeShell(): void {
  vi.stubGlobal("window", {});
  vi.stubGlobal("document", {
    documentElement: {
      hasAttribute: (name: string) => name === "data-native",
    },
  });
}

describe("resolveOAuthCallbackRedirectUrl", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the app custom scheme for a dev native shell (http LAN/localhost origin)", () => {
    stubNativeShell();
    expect(resolveOAuthCallbackRedirectUrl("http://192.168.5.121:3000")).toBe(
      NATIVE_OAUTH_CALLBACK_URL,
    );
    expect(resolveOAuthCallbackRedirectUrl("http://localhost:3000")).toBe(
      NATIVE_OAUTH_CALLBACK_URL,
    );
  });

  it("maps a fixed callback path onto the dev custom scheme", () => {
    stubNativeShell();
    expect(
      resolveOAuthCallbackRedirectUrl("http://192.168.5.121:3000", "/auth/callback/partner-pricing"),
    ).toBe("com.axisseattlehousing.app://auth/callback/partner-pricing");
  });

  it("keeps the https bridge flow for production native (unchanged)", () => {
    stubNativeShell();
    const url = resolveOAuthCallbackRedirectUrl("https://www.axis-seattle-housing.com");
    expect(url.startsWith("https://www.axis-seattle-housing.com/auth/callback?")).toBe(true);
    expect(url).toContain(`${NATIVE_OAUTH_BRIDGE_PARAM}=1`);
  });

  it("uses the bare same-origin callback on the web (non-native)", () => {
    expect(resolveOAuthCallbackRedirectUrl("http://localhost:3000")).toBe(
      "http://localhost:3000/auth/callback",
    );
  });
});
