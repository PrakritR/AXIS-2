"use client";

import { ChevronDown } from "lucide-react";
import { useCallback, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type PortalCollapsibleSectionProps = {
  title: ReactNode;
  /** One-line summary shown under the title in the header (e.g. resident detail sections). */
  subtitle?: ReactNode;
  /** Extra label content beside the title (badges, etc.). */
  titleAddon?: ReactNode;
  defaultExpanded?: boolean;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  /** When false, content is always visible and the header is not clickable. */
  collapsible?: boolean;
  headerActions?: ReactNode;
  children?: ReactNode;
  contentClassName?: string;
  className?: string;
  toggleDataAttr?: string;
  /** Promotion-style dark surface on property cards. */
  surfaceMuted?: boolean;
  /** Uppercase muted label (Preview block) instead of semibold title. */
  titleVariant?: "section" | "label" | "resident";
  /** Keep header actions on the title row (property section toolbars). */
  headerActionsInline?: boolean;
};

/**
 * Standard portal collapsible card — same header/chevron pattern as Promotion.
 * Use on property, resident, and vendor section panels.
 */
export function PortalCollapsibleSection({
  title,
  subtitle,
  titleAddon,
  defaultExpanded = true,
  expanded: controlledExpanded,
  onExpandedChange,
  collapsible = true,
  headerActions,
  children,
  contentClassName,
  className = "",
  toggleDataAttr = "portal-section-toggle",
  surfaceMuted = true,
  titleVariant = "section",
  headerActionsInline = false,
}: PortalCollapsibleSectionProps) {
  const [uncontrolledExpanded, setUncontrolledExpanded] = useState(defaultExpanded);
  const isControlled = controlledExpanded !== undefined;
  const expanded = isControlled ? controlledExpanded : uncontrolledExpanded;
  const canCollapse = collapsible && children != null;

  const setExpanded = useCallback(
    (next: boolean) => {
      if (!isControlled) setUncontrolledExpanded(next);
      onExpandedChange?.(next);
    },
    [isControlled, onExpandedChange],
  );

  const toggle = () => {
    if (!canCollapse) return;
    setExpanded(!expanded);
  };

  const showBody = children != null && (!canCollapse || expanded);

  const titleClass =
    titleVariant === "label"
      ? "flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.12em] text-muted"
      : titleVariant === "resident"
        ? "flex min-w-0 items-center gap-1.5 text-xs font-bold uppercase tracking-[0.14em] text-muted"
        : "flex min-w-0 items-center gap-1.5 text-sm font-semibold text-foreground";

  return (
    <div
      className={`overflow-hidden rounded-2xl border border-border bg-card ${
        surfaceMuted ? "[html[data-theme=dark]_&]:portal-surface-muted" : "shadow-[var(--shadow-sm)]"
      } ${className}`.trim()}
    >
      <div
        className={cn(
          "gap-2 bg-accent/30 px-4 py-2.5 [html[data-native]_&]:px-3 [html[data-native]_&]:py-2",
          headerActionsInline
            ? "flex flex-col items-stretch max-sm:gap-2.5 sm:flex-row sm:items-center sm:justify-between"
            : "flex items-center justify-between",
          canCollapse ? "cursor-pointer" : "",
        )}
        role={canCollapse ? "button" : undefined}
        tabIndex={canCollapse ? 0 : undefined}
        aria-expanded={canCollapse ? expanded : undefined}
        data-attr={canCollapse ? toggleDataAttr : undefined}
        onClick={toggle}
        onKeyDown={(e) => {
          if (!canCollapse) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        }}
      >
        <div className={cn("min-w-0", headerActionsInline ? "flex-none sm:flex-1" : "flex-1")}>
          <div className={titleClass}>
            <span className={headerActionsInline ? "whitespace-nowrap" : "min-w-0"}>{title}</span>
            {titleAddon ? <span className="shrink-0">{titleAddon}</span> : null}
            {canCollapse ? (
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-muted transition-transform ${expanded ? "" : "-rotate-90"}`}
                aria-hidden
              />
            ) : null}
          </div>
          {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
        </div>
        {headerActions ? (
          <div
            className={cn(
              "flex min-w-0 items-center gap-2",
              headerActionsInline
                ? "w-full max-w-full shrink-0 flex-nowrap justify-start overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:ml-2 sm:w-auto sm:max-w-[70%] sm:flex-wrap sm:justify-end sm:overflow-visible sm:pb-0"
                : "w-full shrink-0 flex-wrap justify-end lg:ml-auto lg:w-auto lg:max-w-[70%]",
            )}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            {headerActions}
          </div>
        ) : null}
      </div>
      {showBody ? (
        <div
          className={cn(
            "px-4 pb-3 pt-3 [html[data-native]_&]:px-3 [html[data-native]_&]:pb-2.5 [html[data-native]_&]:pt-2.5",
            contentClassName ?? "pb-4",
          )}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
