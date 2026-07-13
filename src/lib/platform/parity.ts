/**
 * Web + native platform parity for Axis.
 *
 * Architecture: one Next.js app serves the browser and the Capacitor shell.
 * The iOS/Android apps load the deployed site in a WebView — portal UI, auth,
 * and API routes are shared. Deploying to Vercel updates both web and app UI.
 *
 * When adding product surfaces, update the registries in this file (and the
 * portal section lists in src/lib/portals/*) so deep links, push taps, and
 * CI checks stay aligned. See docs/web-and-native-parity.md.
 */

/** Paths that load inside the product (browser tab or Capacitor WebView). */
export const IN_APP_PATH_PREFIXES = [
  "/auth/",
  "/resident/",
  "/portal/",
  "/admin/",
  "/pro/",
  "/rent/",
  "/partner/",
  "/billing/",
  "/vendor/",
  "/owner/",
] as const;

/** Exact paths (no trailing segment) that are also in-app. */
export const IN_APP_PATH_EXACT = ["/", "/partner", "/pricing", "/contact", "/tos", "/privacy"] as const;

/**
 * Push notification tap targets used in server code — keep in sync when adding
 * new notification flows. platform-parity.test.ts validates each entry.
 */
export const REGISTERED_PUSH_DEEP_LINKS = [
  "/resident/payments",
  "/resident/dashboard",
  "/resident/applications",
  "/resident/inbox/unopened",
  "/portal/inbox/unopened",
  "/admin/inbox/unopened",
  "/vendor/inbox/unopened",
  "/owner/inbox/unopened",
] as const;

export type PlatformSurface = "web" | "native-webview";

/** Both web and native app use the same routes and React components. */
export const SHARED_UI_SURFACES: PlatformSurface[] = ["web", "native-webview"];

export function isInAppPath(pathname: string): boolean {
  if (!pathname.startsWith("/")) return false;
  if (pathname.startsWith("/api/")) return false;
  if ((IN_APP_PATH_EXACT as readonly string[]).includes(pathname)) return true;
  return IN_APP_PATH_PREFIXES.some(
    (prefix) => pathname === prefix.slice(0, -1) || pathname.startsWith(prefix),
  );
}

/** Universal links / custom URL schemes — must stay inside the WebView. */
export function isNativeDeepLinkPath(pathname: string): boolean {
  return isInAppPath(pathname);
}

/**
 * Validates push notification deep links at send time. Throws so bad paths fail
 * tests and stand out in development logs.
 */
export function assertInAppPushPath(pathname: string, context = "push notification"): void {
  const path = pathname.trim();
  if (!path.startsWith("/")) {
    throw new Error(`${context} url must be an in-app path starting with /, got: ${pathname}`);
  }
  if (!isInAppPath(path)) {
    throw new Error(
      `${context} url "${path}" is not registered as an in-app path. Add its prefix to IN_APP_PATH_PREFIXES in src/lib/platform/parity.ts.`,
    );
  }
}

/** Checklist referenced by AGENTS.md and docs/web-and-native-parity.md */
export const PLATFORM_CHANGE_CHECKLIST = [
  "Portal/nav change: update src/lib/portals/* section registry and render-portal-section.tsx",
  "Nav order: registries (pro.ts, admin.ts, resident-sections.ts) are canonical — native bottom bar shows a curated NATIVE_BOTTOM_NAV_*_PRIMARY set from portal-bottom-nav.ts, everything else lives in the swipe-up More sheet",
  "Free-tier gating: update RESIDENT_FREE_TIER_SECTION_IDS or manager-access tier sets",
  "New in-app route: add prefix to IN_APP_PATH_PREFIXES if outside existing portals",
  "Push notification: use assertInAppPushPath and add path to REGISTERED_PUSH_DEEP_LINKS",
  "File upload / camera: use useNativeCamera() (web falls back to file input)",
  "Native-only layout: use html[data-native] / portal-layout-classes.ts safe-area tokens",
  "Deploy: Vercel deploy updates web + app UI; run npm run test:unit (platform-parity)",
  "Native shell change only (plugins, icons, permissions): npx cap sync + app store build",
] as const;
