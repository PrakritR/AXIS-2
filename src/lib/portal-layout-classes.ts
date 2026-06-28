/** Target for skip-to-content links in authenticated portal layouts. */
export const PORTAL_MAIN_CONTENT_ID = "portal-main-content";

/** Root shell for authenticated portals — uses dynamic viewport height in the native app. */
export const PORTAL_SHELL_ROOT_CLASS =
  "portal-shell flex h-screen max-h-screen flex-col overflow-hidden bg-background [html[data-native]_&]:h-[100dvh] [html[data-native]_&]:max-h-[100dvh]";

/** Mobile portal top chrome (section nav) — extra top inset on native iOS/Android. */
export const PORTAL_MOBILE_CHROME_CLASS =
  "portal-mobile-chrome border-b border-border bg-background lg:hidden [html[data-native]_&]:pt-[max(0.5rem,env(safe-area-inset-top,0px))]";

/** Scrollable main column: safe-area insets + tighter padding on small screens (all authenticated portals). */
export const PORTAL_MAIN_CONTENT_CLASS =
  "relative z-0 min-h-0 min-w-0 flex-1 overflow-x-clip overflow-y-auto overscroll-contain px-3 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] ps-[max(0.75rem,env(safe-area-inset-left,0px))] pe-[max(0.75rem,env(safe-area-inset-right,0px))] sm:px-4 sm:pt-5 sm:pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] lg:px-10 lg:py-9 [html[data-native=ios]_&]:pb-[max(1.5rem,calc(env(safe-area-inset-bottom,0px)+0.5rem))] [html[data-theme=dark]_&]:bg-[var(--portal-surface-dark)] [html[data-theme=light]_&]:bg-[linear-gradient(180deg,#f5f8fd_0%,#e9eef7_100%)] before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(ellipse_at_top_right,rgba(47,107,255,0.1),transparent_58%)] [html[data-theme=light]_&]:before:bg-[radial-gradient(ellipse_at_top_right,rgba(47,107,255,0.06),transparent_55%)]";
