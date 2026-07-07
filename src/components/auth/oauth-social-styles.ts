/** Shared OAuth button chrome — Google blends with card; Apple uses filled contrast like Enrollio. */
export const OAUTH_GOOGLE_BUTTON_CLASS =
  "auth-oauth-google flex w-full items-center justify-center gap-3 rounded-full border border-border/80 bg-card/70 px-4 py-2.5 text-[15px] font-semibold text-foreground shadow-sm backdrop-blur-sm transition hover:bg-accent/50 disabled:cursor-not-allowed disabled:opacity-60 sm:py-3 sm:text-sm [html[data-theme=dark]_&]:border-white/12 [html[data-theme=dark]_&]:bg-white/[0.06]";

export const OAUTH_APPLE_BUTTON_CLASS =
  "auth-oauth-apple flex w-full items-center justify-center gap-3 rounded-full border border-transparent bg-foreground px-4 py-2.5 text-[15px] font-semibold text-background shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 sm:py-3 sm:text-sm [html[data-theme=light]_&]:border-black/10 [html[data-theme=light]_&]:bg-black [html[data-theme=light]_&]:text-white";
