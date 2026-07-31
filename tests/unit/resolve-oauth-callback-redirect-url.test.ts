import { afterEach, describe, expect, it, vi } from "vitest";
import {
  NATIVE_OAUTH_BRIDGE_PARAM,
  appendNativeOAuthBridgeParam,
} from "@/lib/auth/native-oauth-bridge";
import {
  NATIVE_OAUTH_CALLBACK_URL,
  nativeOAuthCallbackUrl,
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

function stubIosNativeShell(): void {
  vi.stubGlobal("window", {
    Capacitor: {
      isNativePlatform: () => true,
      getPlatform: () => "ios",
    },
  });
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

  it("returns custom scheme callback for iOS native (ASWebAuthenticationSession)", () => {
    stubIosNativeShell();
    expect(resolveOAuthCallbackRedirectUrl("https://prop-lane.space")).toBe(NATIVE_OAUTH_CALLBACK_URL);
    expect(
      resolveOAuthCallbackRedirectUrl("https://prop-lane.space", "/auth/callback/partner-pricing"),
    ).toBe(nativeOAuthCallbackUrl("/auth/callback/partner-pricing"));
  });

  it("returns https callback with native_bridge for Android native shell", () => {
    stubNativeShell();
    expect(resolveOAuthCallbackRedirectUrl("http://192.168.5.121:3000")).toBe(
      appendNativeOAuthBridgeParam("http://192.168.5.121:3000/auth/callback"),
    );
    expect(resolveOAuthCallbackRedirectUrl("http://localhost:3000")).toBe(
      appendNativeOAuthBridgeParam("http://localhost:3000/auth/callback"),
    );
  });

  it("maps a fixed callback path onto https with native_bridge on Android native", () => {
    stubNativeShell();
    expect(
      resolveOAuthCallbackRedirectUrl("http://192.168.5.121:3000", "/auth/callback/partner-pricing"),
    ).toBe(
      appendNativeOAuthBridgeParam("http://192.168.5.121:3000/auth/callback/partner-pricing"),
    );
  });

  it("returns https callback with native_bridge for production Android native (https origin)", () => {
    stubNativeShell();
    expect(resolveOAuthCallbackRedirectUrl("https://prop-lane.space")).toBe(
      appendNativeOAuthBridgeParam("https://prop-lane.space/auth/callback"),
    );
    expect(resolveOAuthCallbackRedirectUrl("https://www.axis-seattle-housing.com")).toBe(
      appendNativeOAuthBridgeParam("https://www.axis-seattle-housing.com/auth/callback"),
    );
  });

  it("uses the bare same-origin callback on the web (non-native)", () => {
    expect(resolveOAuthCallbackRedirectUrl("http://localhost:3000")).toBe(
      "http://localhost:3000/auth/callback",
    );
  });
});
