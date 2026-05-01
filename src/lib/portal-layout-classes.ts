/** Scrollable main column: safe-area insets + tighter padding on small screens (all authenticated portals). */
export const PORTAL_MAIN_CONTENT_CLASS =
  "relative z-0 min-h-0 min-w-0 flex-1 overflow-x-clip overflow-y-auto overscroll-contain bg-gradient-to-b from-white/[0.55] via-transparent to-[#eff1f6]/35 px-3 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] ps-[max(0.75rem,env(safe-area-inset-left,0px))] pe-[max(0.75rem,env(safe-area-inset-right,0px))] sm:px-4 sm:pt-5 sm:pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] lg:px-10 lg:py-9";
