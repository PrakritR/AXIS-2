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
        className={`flex flex-wrap items-start justify-between gap-x-2 gap-y-3 bg-accent/30 px-4 py-3 [html[data-native]_&]:px-3 [html[data-native]_&]:py-2.5 ${
          canCollapse ? "cursor-pointer" : ""
        }`}
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
        <div className="min-w-0 flex-1">
          <div className={titleClass}>
            <span className="min-w-0">{title}</span>
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
            className="flex w-full min-w-0 flex-wrap items-center justify-start gap-2 lg:ml-auto lg:w-auto lg:max-w-[70%] lg:justify-end"
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
            "px-4 pb-4 pt-4 sm:pt-5 [html[data-native]_&]:px-3 [html[data-native]_&]:pb-3 [html[data-native]_&]:pt-3",
            contentClassName ?? "pb-6",
          )}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
