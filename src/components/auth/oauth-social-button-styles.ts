/** Shared layout for Google / Apple OAuth buttons on auth surfaces. */
export const OAUTH_SOCIAL_BUTTON_BASE =
  "flex w-full items-center justify-center gap-3 rounded-full px-4 py-2.5 text-[15px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 sm:py-3 sm:text-sm";

/** Blends with Axis card surfaces (web + native glass). */
export const OAUTH_GOOGLE_BUTTON_CLASS = `${OAUTH_SOCIAL_BUTTON_BASE} border border-border bg-card/80 text-foreground shadow-[var(--shadow-sm)] backdrop-blur-sm hover:bg-accent/60`;

/** Enrollio-style Apple: solid on light, soft black glass on dark. */
export const OAUTH_APPLE_BUTTON_CLASS = `${OAUTH_SOCIAL_BUTTON_BASE} border border-black/10 bg-black text-white shadow-sm hover:bg-black/90 [html[data-theme=dark]_&]:border-white/12 [html[data-theme=dark]_&]:bg-black/80 [html[data-theme=dark]_&]:backdrop-blur-md [html[data-theme=dark]_&]:hover:bg-black/70`;
