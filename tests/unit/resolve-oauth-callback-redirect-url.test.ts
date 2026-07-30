import { afterEach, describe, expect, it, vi } from "vitest";
import {
  NATIVE_OAUTH_CALLBACK_URL,
  resolveOAuthCallbackRedirectUrl,
} from "@/lib/auth/native-oauth-callback";
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
    ).toBe("space.proplane.app://auth/callback/partner-pricing");
  });

  it("returns the app custom scheme for production native (https origin)", () => {
    stubNativeShell();
    expect(resolveOAuthCallbackRedirectUrl("https://prop-lane.space")).toBe(NATIVE_OAUTH_CALLBACK_URL);
    expect(resolveOAuthCallbackRedirectUrl("https://www.axis-seattle-housing.com")).toBe(
      NATIVE_OAUTH_CALLBACK_URL,
    );
  });

  it("uses the bare same-origin callback on the web (non-native)", () => {
    expect(resolveOAuthCallbackRedirectUrl("http://localhost:3000")).toBe(
      "http://localhost:3000/auth/callback",
    );
  });
});
