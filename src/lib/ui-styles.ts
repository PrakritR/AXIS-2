/** Shared form label styling — theme-aware via text-muted. */
export const FIELD_LABEL_CLASS = "text-xs font-semibold text-muted";

/** Readonly input surface — uses --input-readonly-bg from globals.css. */
export const READONLY_INPUT_CLASS = "mt-1.5 input-readonly text-foreground cursor-default";

/** Muted neutral callout (replaces light-only #f8fafc boxes). */
export const BANNER_NEUTRAL_CLASS =
  "rounded-2xl border p-4 text-sm leading-relaxed portal-banner-neutral";

/** Warning / pending callout. */
export const BANNER_WARNING_CLASS =
  "rounded-2xl border p-4 text-sm leading-relaxed portal-banner-pending";

/** Info callout. */
export const BANNER_INFO_CLASS =
  "rounded-2xl border px-4 py-3 text-sm leading-relaxed portal-banner-info";

/** Success callout. */
export const BANNER_SUCCESS_CLASS =
  "rounded-2xl border px-4 py-3 text-sm portal-banner-success";

/** Danger / error callout. */
export const BANNER_DANGER_CLASS =
  "rounded-2xl border px-4 py-3 text-sm portal-banner-danger";

/** Small status pill with ring — append tone class: portal-badge-success | pending | info | danger */
export const BADGE_PILL_BASE_CLASS =
  "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]";

export const BADGE_RING = "ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]";

export const BADGE_SUCCESS_CLASS = `portal-badge-success ${BADGE_RING}`;
export const BADGE_PENDING_CLASS = `portal-badge-pending ${BADGE_RING}`;
export const BADGE_DANGER_CLASS = `portal-badge-danger ${BADGE_RING}`;
export const BADGE_INFO_CLASS = `portal-badge-info ${BADGE_RING}`;

/** Rose outline button — theme-aware via portal-danger-outline in globals.css */
export const DANGER_OUTLINE_BTN_CLASS =
  "rounded-full border-rose-200 text-rose-800 hover:bg-[var(--status-overdue-bg)] portal-danger-outline";
