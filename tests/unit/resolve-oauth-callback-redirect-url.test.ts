import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const isPluginAvailableMock = vi.fn();

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isPluginAvailable: (...args: unknown[]) => isPluginAvailableMock(...args),
  },
}));
import { appendNativeOAuthBridgeParam } from "@/lib/auth/native-oauth-bridge";
import { resolveOAuthCallbackRedirectUrl } from "@/lib/auth/native-oauth-callback";

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

  // iOS (ASWebAuthenticationSession) and Android both use the same-origin HTTPS bridge.
  // The raw custom scheme is deliberately NOT used as redirect_to: Supabase does not
  // allowlist it, silently drops it, and falls back to the project Site URL — so the user
  // lands on the marketing homepage inside the in-app browser instead of returning to the
  // app. The HTTPS callback is the origin Supabase already allowlists; the bridge page then
  // redirects to the custom scheme, which ASWebAuthenticationSession intercepts.
  it("returns the same-origin https bridge callback for iOS native when WebAuthSession is linked", async () => {
    stubIosNativeShell();
    const { resolveOAuthCallbackRedirectUrl: resolve } = await import("@/lib/auth/native-oauth-callback");
    expect(resolve("https://prop-lane.space")).toBe(
      appendNativeOAuthBridgeParam("https://prop-lane.space/auth/callback"),
    );
    expect(resolve("https://prop-lane.space", "/auth/callback/partner-pricing")).toBe(
      appendNativeOAuthBridgeParam("https://prop-lane.space/auth/callback/partner-pricing"),
    );
  });

  it("returns the same https bridge for iOS native regardless of WebAuthSession linkage", async () => {
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
