/**
 * Native app entry paths — re-exported from the shared platform parity registry.
 * @see src/lib/platform/parity.ts
 * @see docs/web-and-native-parity.md
 */

import { isInAppPath, isNativeDeepLinkPath as parityIsNativeDeepLinkPath } from "@/lib/platform/parity";

/** Paths under /rent that residents need in the native app (browse, listing detail, application wizard). */
const NATIVE_RENT_ALLOW_PREFIXES = ["/rent/apply", "/rent/browse", "/rent/listings"];

/** Auth, portals, checkout flows — everything else redirects in the native shell. */
const NATIVE_APP_ALLOWED_PREFIXES = [
  "/auth",
  "/portal",
  "/resident",
  "/admin",
  "/pro",
  "/billing",
] as const;

/** Public pages reachable from inside the app (e.g. admin "Contact us" link). */
const NATIVE_APP_ALLOWED_EXACT = ["/contact"] as const;

export function isNativeAppAllowedPath(pathname: string): boolean {
  if (!pathname.startsWith("/")) return false;
  if ((NATIVE_APP_ALLOWED_EXACT as readonly string[]).includes(pathname)) return true;
  if (NATIVE_APP_ALLOWED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return true;
  }
  return NATIVE_RENT_ALLOW_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function shouldNativeRedirectToWelcome(pathname: string): boolean {
  return pathname.startsWith("/") && !isNativeAppAllowedPath(pathname);
}

/** In-app paths opened from universal links / custom URL schemes. */
export function isNativeDeepLinkPath(pathname: string): boolean {
  return parityIsNativeDeepLinkPath(pathname);
}

/** Whether a path should load inside the Capacitor WebView (not the system browser). */
export { isInAppPath };
