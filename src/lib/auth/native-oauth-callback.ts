import { appendNativeOAuthBridgeParam } from "@/lib/auth/native-oauth-bridge";
import { bareAuthCallbackUrl } from "@/lib/auth/oauth-redirect";
import { detectNativePlatformSync } from "@/lib/native/detect-native";

/** Custom URL scheme registered in iOS/Android for OAuth return to the Capacitor shell. */
export const NATIVE_OAUTH_SCHEME = "space.proplane.app";

export const NATIVE_OAUTH_CALLBACK_URL = `${NATIVE_OAUTH_SCHEME}://auth/callback`;

export function nativeOAuthCallbackUrl(fixedCallbackPath?: string): string {
  const path = fixedCallbackPath?.startsWith("/") ? fixedCallbackPath.replace(/^\//, "") : "auth/callback";
  return `${NATIVE_OAUTH_SCHEME}://${path}`;
}

/** True when OAuth should return via the app custom URL scheme (Capacitor or tagged WebView). */
export function isNativeOAuthShell(): boolean {
  if (typeof window === "undefined") return false;
  if (detectNativePlatformSync()) return true;
  return document.documentElement.hasAttribute("data-native");
}

/**
 * Supabase OAuth redirectTo.
 * Native shell (iOS ASWebAuthenticationSession + Android Custom Tabs): the same-origin HTTPS
 *   bridge with `native_bridge=1`. The bridge page redirects to the app custom scheme, which
 *   iOS ASWebAuthenticationSession intercepts (Android deep-links back), handing control back
 *   to the app's own WebView. We deliberately do NOT use the raw custom scheme as redirectTo:
 *   Supabase does not allowlist a custom scheme by default, so it silently drops the
 *   redirect_to and falls back to the project Site URL — the user then lands on the marketing
 *   homepage inside the in-app browser instead of returning to the app. The HTTPS callback,
 *   by contrast, is the one Supabase already allowlists (its own Site URL / Redirect URLs).
 * Web: same-origin /auth/callback.
 */
export function resolveOAuthCallbackRedirectUrl(origin: string, fixedCallbackPath?: string): string {
  const base = origin.replace(/\/$/, "");
  const httpsCallback = fixedCallbackPath?.startsWith("/")
    ? `${base}${fixedCallbackPath}`
    : bareAuthCallbackUrl(origin);
  if (isNativeOAuthShell()) {
    return appendNativeOAuthBridgeParam(httpsCallback);
  }
  return httpsCallback;
}

/** Map app deep link (custom scheme) back to a same-origin path in the WebView. */
export function webPathFromNativeOAuthUrl(url: string, origin: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== `${NATIVE_OAUTH_SCHEME}:`) return null;
    const segments = [parsed.host, parsed.pathname.replace(/^\//, "")].filter(Boolean);
    const path = `/${segments.join("/")}`;
    return `${origin.replace(/\/$/, "")}${path}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}
