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
 * Native: same-origin HTTPS callback with `native_bridge=1` — Supabase allowlists https,
 * SFSafariViewController loads a valid page, then the server 302s into the app scheme.
 * Direct custom-scheme redirectTo breaks iOS with "address is invalid" in the system browser.
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
