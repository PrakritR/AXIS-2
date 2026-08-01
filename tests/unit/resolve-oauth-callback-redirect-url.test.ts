import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const isPluginAvailableMock = vi.fn();

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isPluginAvailable: (...args: unknown[]) => isPluginAvailableMock(...args),
  },
}));
import { appendNativeOAuthBridgeParam } from "@/lib/auth/native-oauth-bridge";
import {
  resolveOAuthCallbackRedirectUrl,
  NATIVE_OAUTH_CALLBACK_URL,
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
  beforeEach(() => {
    isPluginAvailableMock.mockImplementation((name: string) => name === "WebAuthSession");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  // iOS ASWebAuthenticationSession gets the app custom scheme DIRECTLY as redirect_to. The
  // session's callbackURLScheme intercepts Supabase's 302 to it and dismisses the sheet with
  // no HTML page and no JavaScript. Both Supabase projects allowlist
  // space.proplane.app://auth/callback(/**), so redirect_to is honored (not dropped to the
  // Site URL). Android keeps the HTTPS bridge.
  it("returns the custom scheme directly on iOS when WebAuthSession is linked", async () => {
    stubIosNativeShell();
    const { resolveOAuthCallbackRedirectUrl: resolve } = await import("@/lib/auth/native-oauth-callback");
    expect(resolve("https://prop-lane.space")).toBe(NATIVE_OAUTH_CALLBACK_URL);
    expect(resolve("https://prop-lane.space", "/auth/callback/partner-pricing")).toBe(
      "space.proplane.app://auth/callback/partner-pricing",
    );
  });

  it("falls back to the HTTPS bridge on iOS when WebAuthSession is absent", async () => {
    // Such an iOS binary cannot run ASWebAuthenticationSession, so openOAuthUrl never reaches
    // OAuth (it shows a rebuild hint) — the redirect_to value is moot, so keep the legacy one.
    stubIosNativeShell();
    isPluginAvailableMock.mockReturnValue(false);
    const { resolveOAuthCallbackRedirectUrl: resolve } = await import("@/lib/auth/native-oauth-callback");
    expect(resolve("https://prop-lane.space")).toBe(
      appendNativeOAuthBridgeParam("https://prop-lane.space/auth/callback"),
    );
    expect(resolve("https://prop-lane.space", "/auth/callback/partner-pricing")).toBe(
      appendNativeOAuthBridgeParam("https://prop-lane.space/auth/callback/partner-pricing"),
    );
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
