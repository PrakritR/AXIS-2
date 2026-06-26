/** Opaque modal shell — solid card surface so background content does not bleed through. */
export const MODAL_PANEL_CLASS =
  "modal-panel relative w-full max-w-lg overflow-hidden rounded-2xl border border-border p-5 shadow-[var(--shadow-card)] sm:p-6";

/** Bordered inset panel for message previews, link URLs, and read-only blocks inside modals. */
export const MODAL_INSET_BOX_CLASS =
  "rounded-xl border border-border bg-accent/30 p-3 text-sm leading-relaxed text-muted";

export const MODAL_INSET_BOX_PRE_CLASS = `${MODAL_INSET_BOX_CLASS} whitespace-pre-wrap`;

export const MODAL_WARNING_BOX_CLASS =
  "rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-relaxed text-amber-950";

export const MODAL_FIELD_LABEL_CLASS = "text-xs font-semibold uppercase tracking-wide text-muted";

export const MODAL_OVERLAY_BACKDROP_CLASS = "modal-overlay fixed inset-0";
