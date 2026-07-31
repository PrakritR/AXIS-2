import { describe, expect, it } from "vitest";
import {
  appendNativeOAuthBridgeParam,
  httpsCallbackToNativeSchemeUrl,
  httpsCallbackWithoutBridgeParam,
  nativeOAuthBridgeResponse,
  NATIVE_OAUTH_BRIDGE_PARAM,
  shouldRenderNativeOAuthBridge,
} from "@/lib/auth/native-oauth-bridge";
import { NATIVE_OAUTH_CALLBACK_URL } from "@/lib/auth/native-oauth-callback";
import { NextRequest } from "next/server";

describe("native OAuth bridge", () => {
  it("appends the bridge flag to https callbacks", () => {
    const url = appendNativeOAuthBridgeParam("https://www.axis-seattle-housing.com/auth/callback");
    expect(url).toContain(`${NATIVE_OAUTH_BRIDGE_PARAM}=1`);
    expect(url.startsWith("https://www.axis-seattle-housing.com/auth/callback?")).toBe(true);
  });

  it("maps https callbacks to the app custom scheme without the bridge flag", () => {
    const https = new URL(
      "https://www.axis-seattle-housing.com/auth/callback?native_bridge=1&code=abc123",
    );
    expect(httpsCallbackToNativeSchemeUrl(https)).toBe(
      `${NATIVE_OAUTH_CALLBACK_URL}?code=abc123`,
    );
  });

  it("maps nested callback paths to the custom scheme", () => {
    const https = new URL(
      "https://www.axis-seattle-housing.com/auth/callback/partner-pricing?native_bridge=1&code=abc",
    );
    expect(httpsCallbackToNativeSchemeUrl(https)).toBe(
      "space.proplane.app://auth/callback/partner-pricing?code=abc",
    );
  });

  it("skips bridge HTML inside the Capacitor WebView so the code is exchanged", () => {
    const req = new NextRequest(
      "https://www.axis-seattle-housing.com/auth/callback?native_bridge=1&code=abc123",
      { headers: { "user-agent": "Mozilla/5.0 Capacitor iOS" } },
    );
    expect(shouldRenderNativeOAuthBridge(req)).toBe(false);
  });

  it("renders bridge HTML for system-browser OAuth returns", () => {
    const req = new NextRequest(
      "https://www.axis-seattle-housing.com/auth/callback?native_bridge=1&code=abc123",
      { headers: { "user-agent": "Mozilla/5.0 Mobile Safari" } },
    );
    expect(shouldRenderNativeOAuthBridge(req)).toBe(true);
  });

  it("strips native_bridge from the https web fallback URL", () => {
    const https = new URL(
      "https://www.axis-seattle-housing.com/auth/callback?native_bridge=1&code=abc123",
    );
    expect(httpsCallbackWithoutBridgeParam(https)).toBe(
      "https://www.axis-seattle-housing.com/auth/callback?code=abc123",
    );
  });

  it("returns HTML (not a redirect) with scheme link, web fallback, and visible anchors", async () => {
    const callbackUrl = new URL(
      "https://prop-lane.space/auth/callback?native_bridge=1&code=abc123",
    );
    const response = nativeOAuthBridgeResponse(callbackUrl);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(html).toContain(`${NATIVE_OAUTH_CALLBACK_URL}?code=abc123`);
    expect(html).toContain("https://prop-lane.space/auth/callback?code=abc123");
    expect(html).not.toContain("native_bridge");
    expect(html).toContain("Open PropLane");
    expect(html).toContain("Continue in your browser");
    expect(html).toContain('id="open-app"');
    expect(html).toContain('id="continue-browser"');
    expect(html).toContain("visibilitychange");
    expect(html).toContain("1500");
  });

  it("does not render bridge HTML inside the Capacitor WebView", () => {
    const req = new NextRequest(
      "https://www.axis-seattle-housing.com/auth/callback?native_bridge=1&code=abc123",
      { headers: { "user-agent": "Mozilla/5.0 Capacitor iOS" } },
    );
    expect(shouldRenderNativeOAuthBridge(req)).toBe(false);
  });
});
