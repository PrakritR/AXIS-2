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
 * True on an iOS shell whose binary links the `WebAuthSession` plugin
 * (ASWebAuthenticationSession). Reads the injected `window.Capacitor` global the same way
 * `detectNativePlatformSync` does rather than importing `@capacitor/core`: this module is in the
 * import graph of the `/auth/callback*` server route handlers, which must not pull the
 * browser-only Capacitor SDK into the server bundle.
 */
function iosWebAuthSessionAvailable(): boolean {
  if (typeof window === "undefined") return false;
  if (detectNativePlatformSync() !== "ios") return false;
  try {
    const cap = (
      window as Window & { Capacitor?: { isPluginAvailable?: (name: string) => boolean } }
    ).Capacitor;
    return cap?.isPluginAvailable?.("WebAuthSession") === true;
  } catch {
    return false;
  }
}

/**
 * Supabase OAuth redirectTo — how control returns to the app after auth:
 *   - iOS (ASWebAuthenticationSession): the app custom scheme DIRECTLY,
 *     `space.proplane.app://auth/callback`. The session is started with
 *     `callbackURLScheme: "space.proplane.app"`, so Supabase's 302 to this URL is intercepted
 *     by the session, which dismisses itself with NO HTML page and NO JavaScript in the loop;
 *     the WebView then completes the code exchange via `finishNativeOAuthFromRawUrl`. Both the
 *     dev and production Supabase projects allowlist `space.proplane.app://auth/callback(/**)`,
 *     so `redirect_to` is honored and NOT dropped to the project Site URL. (This is why the old
 *     HTTPS-bridge indirection on iOS is no longer needed.)
 *   - Android (Chrome Custom Tab): the same-origin HTTPS bridge with `native_bridge=1`; the
 *     bridge page deep-links back to the app custom scheme.
 * Web: same-origin /auth/callback, no flag.
 */
export function resolveOAuthCallbackRedirectUrl(origin: string, fixedCallbackPath?: string): string {
  const base = origin.replace(/\/$/, "");
  const httpsCallback = fixedCallbackPath?.startsWith("/")
    ? `${base}${fixedCallbackPath}`
    : bareAuthCallbackUrl(origin);
  if (isNativeOAuthShell()) {
    if (iosWebAuthSessionAvailable()) {
      return nativeOAuthCallbackUrl(fixedCallbackPath);
    }
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
