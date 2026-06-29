/** Target for skip-to-content links in authenticated portal layouts. */
export const PORTAL_MAIN_CONTENT_ID = "portal-main-content";

/** Root shell for authenticated portals — uses dynamic viewport height in the native app. */
export const PORTAL_SHELL_ROOT_CLASS =
  "portal-shell flex h-screen max-h-screen flex-col overflow-hidden bg-background [html[data-native]_&]:h-[100dvh] [html[data-native]_&]:max-h-[100dvh]";

/** Mobile portal top chrome (section nav) — hidden in the native app (see portal-native-bottom-nav). */
export const PORTAL_MOBILE_CHROME_CLASS =
  "portal-mobile-chrome border-b border-border bg-background lg:hidden";

/** Native app bottom tab bar — replaces the mobile top hotbar. */
export const PORTAL_NATIVE_BOTTOM_NAV_CLASS =
  "portal-native-bottom-nav fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 backdrop-blur-xl lg:hidden pb-[max(0.35rem,env(safe-area-inset-bottom,0px))] ps-[max(0px,env(safe-area-inset-left,0px))] pe-[max(0px,env(safe-area-inset-right,0px))] [html[data-native]_&]:pb-[max(0.5rem,var(--native-safe-bottom))] [html[data-native]_&]:ps-[max(0px,var(--native-safe-left))] [html[data-native]_&]:pe-[max(0px,var(--native-safe-right))]";

/** Top-of-screen portal banners (upgrade strip, admin preview) — clears the notch. */
export const PORTAL_TOP_BANNER_STRIP_CLASS =
  "portal-top-banner-strip pt-[max(0.625rem,env(safe-area-inset-top,0px))] ps-[max(0px,env(safe-area-inset-left,0px))] pe-[max(0px,env(safe-area-inset-right,0px))] [html[data-native]_&]:pt-[max(0.75rem,var(--native-safe-top))] [html[data-native]_&]:ps-[max(0px,var(--native-safe-left))] [html[data-native]_&]:pe-[max(0px,var(--native-safe-right))]";

/** Scrollable main column: safe-area insets + tighter padding on small screens (all authenticated portals). */
export const PORTAL_MAIN_CONTENT_CLASS =
  "relative z-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-x-clip overflow-y-auto overscroll-contain px-3 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] ps-[max(0.75rem,env(safe-area-inset-left,0px))] pe-[max(0.75rem,env(safe-area-inset-right,0px))] sm:px-4 sm:pt-5 sm:pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] lg:block lg:px-10 lg:py-9 [html[data-native]_&]:pt-[max(0.75rem,var(--native-safe-top))] [html[data-native]_&]:pb-[max(5.25rem,calc(var(--native-safe-bottom)+4.75rem))] [html[data-native=ios]_&]:pb-[max(5.25rem,calc(var(--native-safe-bottom)+4.75rem))] [html[data-theme=dark]_&]:bg-[var(--portal-surface-dark)] [html[data-theme=light]_&]:bg-[linear-gradient(180deg,#f5f8fd_0%,#e9eef7_100%)] before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(ellipse_at_top_right,rgba(47,107,255,0.1),transparent_58%)] [html[data-theme=light]_&]:before:bg-[radial-gradient(ellipse_at_top_right,rgba(47,107,255,0.06),transparent_55%)] [html[data-native]_&]:before:hidden";

/** Mobile: vertically center tab content in the viewport; desktop: normal top-aligned flow. */
export const PORTAL_MAIN_CONTENT_INNER_CLASS =
  "portal-main-inner flex min-h-full w-full flex-1 flex-col justify-center lg:min-h-0 lg:flex-initial lg:justify-start [html[data-native]_&]:min-h-0 [html[data-native]_&]:justify-start";
