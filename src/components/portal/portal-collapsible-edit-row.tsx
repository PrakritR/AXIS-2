"use client";

import { type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { isPortalRowClickIgnored, PortalTableExpandChevron } from "@/components/portal/portal-data-table";
import { cn } from "@/lib/utils";

export const PORTAL_EDIT_ROW_REMOVE_BUTTON_CLASS =
  "h-7 shrink-0 rounded-full px-2.5 text-xs border-rose-200 text-rose-800 portal-danger-outline";

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
  /** Extra controls beside Remove (e.g. + Add question). Clicks do not toggle expand. */
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
          onKeyDown={onHeaderKeyDown}
        >
          <div className={titleClass}>
            <span className="min-w-0">{title}</span>
            {canExpand ? <PortalTableExpandChevron expanded={expanded} /> : null}
          </div>
          {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
        </div>
        <div
          className="flex shrink-0 flex-wrap items-center justify-end gap-1.5"
          data-portal-row-ignore
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {headerActions}
          {onRemove ? (
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
          ) : null}
        </div>
      </div>
      {canExpand && expanded ? (
        <div className={cn("space-y-3 border-t border-border px-3 py-3 sm:px-3.5", contentClassName)}>
          {children}
        </div>
      ) : null}
    </div>
  );
}
