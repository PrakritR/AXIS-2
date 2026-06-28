/**
 * Native app entry paths — re-exported from the shared platform parity registry.
 * @see src/lib/platform/parity.ts
 * @see docs/web-and-native-parity.md
 */

import { isInAppPath, isNativeDeepLinkPath as parityIsNativeDeepLinkPath } from "@/lib/platform/parity";

/** Public paths where the native app should offer auth onboarding when signed out. */

const NATIVE_MARKETING_PREFIXES = ["/", "/partner", "/pricing"];

/** Paths under /rent that residents need in the native app (application wizard). */
const NATIVE_RENT_ALLOW_PREFIXES = ["/rent/apply"];

export function shouldNativeRedirectToWelcome(pathname: string): boolean {
  if (!pathname.startsWith("/")) return false;
  if (pathname.startsWith("/auth")) return false;
  if (NATIVE_RENT_ALLOW_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return false;
  }
  if (
    pathname.startsWith("/portal") ||
    pathname.startsWith("/resident") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/pro")
  ) {
    return false;
  }
  return NATIVE_MARKETING_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
    || pathname.startsWith("/rent");
}

/** In-app paths opened from universal links / custom URL schemes. */
export function isNativeDeepLinkPath(pathname: string): boolean {
  return parityIsNativeDeepLinkPath(pathname);
}

/** Whether a path should load inside the Capacitor WebView (not the system browser). */
export { isInAppPath };
