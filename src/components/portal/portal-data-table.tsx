import type { MouseEvent, ReactNode } from "react";

/** Outer frame for tabbed portal tables — solid card surface (not glass). */
export const PORTAL_DATA_TABLE_WRAP =
  "relative z-0 max-w-full overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-sm)]";

export const PORTAL_DATA_TABLE_SCROLL = "relative z-0 max-w-full overflow-x-auto";

/** Table header row (use under `<thead>`). */
export const PORTAL_TABLE_HEAD_ROW = "border-b border-border bg-accent/30";

/** Primary data row. */
export const PORTAL_TABLE_TR =
  "border-b border-border/80 transition-colors last:border-0 hover:bg-accent/40";

/** Summary row that expands on click (entire row toggles detail). */
export const PORTAL_TABLE_TR_EXPANDABLE = `${PORTAL_TABLE_TR} cursor-pointer`;

const PORTAL_ROW_CLICK_IGNORE_SELECTOR =
  "button, a, input, select, textarea, label, [data-portal-row-ignore]";

export function isPortalRowClickIgnored(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest(PORTAL_ROW_CLICK_IGNORE_SELECTOR));
}

export function createPortalRowExpandClick(
  onToggle: () => void,
): (event: MouseEvent<HTMLTableRowElement>) => void {
  return (event) => {
    if (isPortalRowClickIgnored(event.target)) return;
    onToggle();
  };
}

/** Expanded detail row (full-width cell below the summary row). */
export const PORTAL_TABLE_DETAIL_ROW = "border-b border-border/80 bg-accent/25 last:border-0";

/** Data cell padding — room for name / property lines to breathe. */
export const PORTAL_TABLE_TD = "px-4 py-4 align-middle text-sm text-foreground/80 sm:px-5 sm:py-[1.125rem]";

/** Detail row cell padding. */
export const PORTAL_TABLE_DETAIL_CELL = "px-4 py-5 align-top sm:px-6 sm:py-8";

/**
 * Action strip in an expanded detail row — subtle divider + compact buttons.
 * Default `bottom`: border above the strip (content above, actions below).
 * `top`: border below the strip (toolbar first, lease preview / thread below).
 */
export function PortalTableDetailActions({
  children,
  placement = "bottom",
}: {
  children: ReactNode;
  placement?: "top" | "bottom";
}) {
  if (children == null) return null;
  const edge =
    placement === "top"
      ? "mb-6 border-b border-border pb-6"
      : "mt-6 border-t border-border pt-6";
  return <div className={`flex flex-wrap items-center gap-2 sm:gap-2.5 ${edge}`}>{children}</div>;
}

/** Compact action button on a summary row (Schedule, Mark paid, etc.). */
export const PORTAL_TABLE_ROW_TOGGLE_CLASS =
  "h-8 min-h-0 !rounded-lg border-border px-3 py-0 text-xs font-medium text-foreground/80 !shadow-none hover:!translate-y-0 [html[data-theme=dark]_&]:portal-outline-control";

/** Secondary actions in {@link PortalTableDetailActions} (use with `Button variant="outline"`). */
export const PORTAL_DETAIL_BTN =
  "h-8 min-h-0 !rounded-lg border-border px-3 py-0 text-xs font-medium text-foreground/80 !shadow-none hover:!translate-y-0 [html[data-theme=dark]_&]:portal-outline-control";

/** Primary / success action in detail toolbar (use with `Button variant="outline"`). */
export const PORTAL_DETAIL_BTN_PRIMARY =
  "h-8 min-h-0 !rounded-lg !border-emerald-600 !bg-emerald-600 px-3 py-0 text-xs font-medium !text-white hover:!border-emerald-700 hover:!bg-emerald-700 !shadow-none hover:!translate-y-0";

import type { PortalEmptyIconKind } from "@/components/portal/portal-empty-state";
import { PortalEmptyState } from "@/components/portal/portal-empty-state";

export function PortalDataTableEmpty({
  message,
  icon = "default",
}: {
  message: string;
  icon?: PortalEmptyIconKind;
  /** @deprecated Empty states use a single title line. */
  detail?: string;
}) {
  return <PortalEmptyState title={message} icon={icon} />;
}
