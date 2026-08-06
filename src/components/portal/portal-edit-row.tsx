"use client";

import { type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isPortalRowClickIgnored } from "@/components/portal/portal-data-table";
import {
  PORTAL_EDIT_ROW_ICON_DANGER_BUTTON_CLASS,
  PORTAL_EDIT_ROW_REMOVE_BUTTON_CLASS,
} from "@/components/portal/portal-collapsible-edit-row";
import { cn } from "@/lib/utils";

export type PortalEditRowProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  titleVariant?: "label" | "semibold";
  onClick?: () => void;
  onRemove?: () => void;
  removeLabel?: string;
  removeTitle?: string;
  removeDataAttr?: string;
  /** Icon-only × instead of a labeled Remove button (better on narrow screens). */
  removeIconOnly?: boolean;
  headerActions?: ReactNode;
  className?: string;
  clickDataAttr?: string;
  error?: boolean;
};

/**
 * Compressed list row — title + subtitle, click opens edit, Remove at end (no chevron).
 */
export function PortalEditRow({
  title,
  subtitle,
  titleVariant = "semibold",
  onClick,
  onRemove,
  removeLabel = "Remove",
  removeTitle,
  removeDataAttr,
  removeIconOnly = false,
  headerActions,
  className,
  clickDataAttr,
  error = false,
}: PortalEditRowProps) {
  const clickable = Boolean(onClick);
  const titleClass =
    titleVariant === "label"
      ? "text-xs font-bold uppercase tracking-[0.12em] text-muted"
      : "text-sm font-semibold text-foreground";

  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!clickable || isPortalRowClickIgnored(e.target)) return;
    onClick?.();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!clickable || isPortalRowClickIgnored(e.target)) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick?.();
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
          className={cn("min-w-0 flex-1", clickable && "cursor-pointer")}
          role={clickable ? "button" : undefined}
          tabIndex={clickable ? 0 : undefined}
          data-attr={clickable ? clickDataAttr : undefined}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
        >
          <div className={titleClass}>{title}</div>
          {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
        </div>
        {headerActions || onRemove ? (
          <div
            className="flex shrink-0 items-start gap-1 pt-0.5"
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
    </div>
  );
}
