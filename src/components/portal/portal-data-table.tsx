import Link from "next/link";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { useIsNativeApp } from "@/hooks/use-is-native-app";
import { portalListPreviewLimit, sliceForPortalPreview } from "@/lib/portal-mobile-preview";

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

/** Compact card shell for mobile portal lists (pair with {@link PortalResponsiveDataView}). */
export const PORTAL_MOBILE_CARD_CLASS =
  "rounded-2xl border border-border bg-card p-3.5 [html[data-native]_&]:rounded-xl [html[data-native]_&]:p-3";

/** Tighter data cells on native — keeps tabbed lists on one screen longer. */
export const PORTAL_TABLE_TD_COMPACT =
  "px-3 py-3 align-middle text-sm text-foreground/80 sm:px-4 sm:py-3.5 [html[data-native]_&]:px-3 [html[data-native]_&]:py-2.5";

/** List preview limit for dashboard / summary sections (native vs mobile web). */
export function usePortalListPreviewLimit(): number {
  const { isNative } = useIsNativeApp();
  return portalListPreviewLimit(isNative);
}

/** Slice a list for dashboard previews; exposes overflow count for “View all”. */
export function usePortalPreviewSlice<T>(items: T[]): { visible: T[]; overflow: number; limit: number } {
  const { isNative } = useIsNativeApp();
  const limit = portalListPreviewLimit(isNative);
  const { visible, overflow } = sliceForPortalPreview(items, isNative);
  return { visible, overflow, limit };
}

/** Compact summary card for mobile portal tables (residents, applications, payments, …). */
export function PortalMobileSummaryCard({
  title,
  subtitle,
  meta,
  badge,
  trailing,
  onClick,
  expanded,
  children,
}: {
  title: string;
  subtitle?: string;
  meta?: string;
  badge?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  expanded?: boolean;
  children?: ReactNode;
}) {
  const body = (
    <div className="flex items-start justify-between gap-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{title}</p>
        {subtitle ? <p className="mt-0.5 truncate text-xs text-muted">{subtitle}</p> : null}
        {meta ? <p className="mt-0.5 truncate text-[11px] text-muted/90">{meta}</p> : null}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {trailing}
        {badge}
      </div>
    </div>
  );

  return (
    <div className={PORTAL_MOBILE_CARD_CLASS}>
      {onClick ? (
        <div
          role="button"
          tabIndex={0}
          className="w-full cursor-pointer text-left"
          onClick={(e: MouseEvent<HTMLDivElement>) => {
            if (isPortalRowClickIgnored(e.target)) return;
            onClick();
          }}
          onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
            if (isPortalRowClickIgnored(e.target)) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onClick();
            }
          }}
        >
          {body}
        </div>
      ) : (
        body
      )}
      {children ? (
        <div className={`${onClick ? "mt-2.5" : ""} border-t border-border pt-2.5 [html[data-native]_&]:mt-2 [html[data-native]_&]:pt-2`}>
          {children}
        </div>
      ) : null}
      {onClick && children == null ? (
        <div className="mt-2">
          <span className="text-[11px] font-semibold text-primary">{expanded ? "Less" : "Details"}</span>
        </div>
      ) : null}
    </div>
  );
}

/** Footer link when a preview list is truncated. */
export function PortalPreviewOverflowLink({
  overflow,
  href,
  label,
}: {
  overflow: number;
  href: string;
  label?: string;
}) {
  if (overflow <= 0) return null;
  return (
    <Link href={href} className="mt-2 inline-block text-xs font-semibold text-primary hover:underline underline-offset-2">
      {label ?? `+${overflow} more →`}
    </Link>
  );
}

/** Desktop table + mobile card stack — use one layout per breakpoint. */
export function PortalResponsiveDataView({
  mobile,
  desktop,
}: {
  mobile: ReactNode;
  desktop: ReactNode;
}) {
  return (
    <>
      <div className="space-y-2 lg:hidden">{mobile}</div>
      <div className="hidden lg:block">{desktop}</div>
    </>
  );
}

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
  "h-11 min-h-[44px] !rounded-lg border-border px-3 py-0 text-xs font-medium text-foreground/80 !shadow-none hover:!translate-y-0 [html[data-theme=dark]_&]:portal-outline-control";

/** Primary / success action in detail toolbar (use with `Button variant="outline"`). */
export const PORTAL_DETAIL_BTN_PRIMARY =
  "h-11 min-h-[44px] !rounded-lg !border-emerald-600 !bg-emerald-600 px-3 py-0 text-xs font-medium !text-white hover:!border-emerald-700 hover:!bg-emerald-700 !shadow-none hover:!translate-y-0";

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
