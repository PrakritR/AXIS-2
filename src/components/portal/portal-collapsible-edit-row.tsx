"use client";

import { type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isPortalRowClickIgnored, PortalTableExpandChevron } from "@/components/portal/portal-data-table";
import { PortalSectionActionRow } from "@/components/portal/portal-section-action-row";
import { cn } from "@/lib/utils";

export const PORTAL_EDIT_ROW_REMOVE_BUTTON_CLASS =
  "h-7 shrink-0 rounded-full px-2.5 text-xs border-rose-200 text-rose-800 portal-danger-outline";

/** Compact round control for + / × in edit rows (44px touch target). */
export const PORTAL_EDIT_ROW_ICON_BUTTON_CLASS =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted transition hover:bg-accent/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export const PORTAL_EDIT_ROW_ICON_DANGER_BUTTON_CLASS =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-rose-950/30";

export type PortalCollapsibleEditRowProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Uppercase muted label (section headers) vs semibold title (item rows). */
  titleVariant?: "label" | "semibold";
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onRemove?: () => void;
  removeLabel?: string;
  removeTitle?: string;
  removeDataAttr?: string;
  /** Icon-only × instead of a labeled Remove button (better on narrow screens). */
  removeIconOnly?: boolean;
  /** Extra controls beside Remove (e.g. + icon). Clicks do not toggle expand. */
  headerActions?: ReactNode;
  children?: ReactNode;
  className?: string;
  contentClassName?: string;
  toggleDataAttr?: string;
  error?: boolean;
  /** When false, row is a static summary (no chevron, header not clickable). */
  collapsible?: boolean;
};

/**
 * Compressed edit row — title + inline chevron + subtitle, expand to edit, Remove at end.
 * Matches portal-ui-system expand direction (→ collapsed / ↓ expanded).
 */
export function PortalCollapsibleEditRow({
  title,
  subtitle,
  titleVariant = "semibold",
  expanded,
  onExpandedChange,
  onRemove,
  removeLabel = "Remove",
  removeTitle,
  removeDataAttr,
  removeIconOnly = false,
  headerActions,
  children,
  className,
  contentClassName,
  toggleDataAttr,
  error = false,
  collapsible = true,
}: PortalCollapsibleEditRowProps) {
  const canExpand = collapsible && children != null;
  const titleClass =
    titleVariant === "label"
      ? "flex min-w-0 items-center gap-1.5 text-xs font-bold uppercase tracking-[0.12em] text-muted"
      : "flex min-w-0 items-center gap-1.5 text-sm font-semibold text-foreground";

  const toggle = () => {
    if (!canExpand) return;
    onExpandedChange(!expanded);
  };

  const onHeaderClick = (e: MouseEvent<HTMLDivElement>) => {
    if (isPortalRowClickIgnored(e.target)) return;
    toggle();
  };

  const onHeaderMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (!canExpand || isPortalRowClickIgnored(e.target)) return;
    e.preventDefault();
  };

  const onHeaderKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (isPortalRowClickIgnored(e.target)) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    }
  };

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-sm)]",
        error && "border-red-300 ring-2 ring-red-100",
        className,
      )}
    >
      <div className="flex items-start gap-2 bg-accent/20 px-3 py-2.5 sm:px-3.5 sm:py-3">
        <div
          className={cn("min-w-0 flex-1", canExpand && "cursor-pointer")}
          role={canExpand ? "button" : undefined}
          tabIndex={canExpand ? 0 : undefined}
          aria-expanded={canExpand ? expanded : undefined}
          data-attr={canExpand ? toggleDataAttr : undefined}
          onClick={onHeaderClick}
          onMouseDown={onHeaderMouseDown}
          onKeyDown={onHeaderKeyDown}
        >
          <div className={titleClass}>
            <span className="min-w-0">{title}</span>
            {canExpand ? <PortalTableExpandChevron expanded={expanded} /> : null}
          </div>
          {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
        </div>
        {headerActions || onRemove ? (
          <div
            className="flex shrink-0 items-center gap-1"
            data-portal-row-ignore
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            {headerActions}
            {onRemove ? (
              removeIconOnly ? (
                <button
                  type="button"
                  className={PORTAL_EDIT_ROW_ICON_DANGER_BUTTON_CLASS}
                  title={removeTitle ?? removeLabel}
                  aria-label={removeTitle ?? removeLabel}
                  data-attr={removeDataAttr}
                  onClick={onRemove}
                >
                  <X className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                </button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className={PORTAL_EDIT_ROW_REMOVE_BUTTON_CLASS}
                  title={removeTitle ?? removeLabel}
                  data-attr={removeDataAttr}
                  onClick={onRemove}
                >
                  {removeLabel}
                </Button>
              )
            ) : null}
          </div>
        ) : null}
      </div>
      {canExpand && expanded ? (
        <div className={cn("space-y-3 border-t border-border px-3 py-3 sm:px-3.5", contentClassName)}>
          {children}
        </div>
      ) : null}
    </div>
  );
}
