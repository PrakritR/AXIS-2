import { bareAuthCallbackUrl } from "@/lib/auth/oauth-redirect";
import { detectNativePlatformSync } from "@/lib/native/detect-native";

/** Custom URL scheme registered in iOS/Android for OAuth return to the Capacitor shell. */
export const NATIVE_OAUTH_SCHEME = "com.axisseattlehousing.app";

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

/** Supabase OAuth redirectTo — custom scheme in native shell, https callback on web. */
export function resolveOAuthCallbackRedirectUrl(origin: string, fixedCallbackPath?: string): string {
  if (isNativeOAuthShell()) {
    return nativeOAuthCallbackUrl(fixedCallbackPath);
  }
  if (fixedCallbackPath?.startsWith("/")) {
    return `${origin.replace(/\/$/, "")}${fixedCallbackPath}`;
  }
  return bareAuthCallbackUrl(origin);
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
