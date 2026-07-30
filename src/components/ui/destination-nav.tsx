"use client";

import Link from "next/link";
import { HORIZONTAL_SCROLL_ATTR, PORTAL_HORIZONTAL_SCROLL_ROW_CLASS } from "@/lib/horizontal-scroll";
import { cn } from "@/lib/utils";

export type DestinationNavItem = {
  id: string;
  label: string;
  href: string;
  count?: number;
  /** Highlight when this destination has urgent work (overdue, etc.). */
  alert?: boolean;
  dataAttr?: string;
};

/**
 * Routed view switcher — every item is a real URL with a visible label and
 * optional live count. Mobile: horizontal scroll-snap row; desktop: segmented row.
 */
export function DestinationNav({
  items,
  activeHref,
  activeId,
  ariaLabel = "Section views",
  className,
  size = "default",
  /** `equal` stretches every tab across the full bar (record-detail rows). */
  itemLayout = "auto",
}: {
  items: DestinationNavItem[];
  /** Match the active item by normalized href. */
  activeHref?: string;
  /** Match the active item by id (for grouped routes under one parent). */
  activeId?: string;
  ariaLabel?: string;
  className?: string;
  /** `toolbar` matches {@link PORTAL_HEADER_ACTION_BTN} in page header rows. */
  size?: "default" | "toolbar";
  itemLayout?: "auto" | "equal";
}) {
  const normalize = (href: string) => href.replace(/\/$/, "");
  const compactItems = itemLayout === "equal" ? false : items.length > 4;

  return (
    <nav
      className={destinationNavShellClassName(className, itemLayout)}
      aria-label={ariaLabel}
      data-slot="destination-nav"
      {...(itemLayout === "equal" ? {} : { [HORIZONTAL_SCROLL_ATTR]: "" })}
    >
      {items.map((item) => {
        const active =
          (activeId != null && item.id === activeId) ||
          (activeHref != null && normalize(activeHref) === normalize(item.href));
        return (
          <Link
            key={item.id}
            href={item.href}
            data-attr={item.dataAttr}
            className={cn(
              itemLayout === "equal" ? "min-w-0" : destinationNavItemWidthClass(compactItems),
              "portal-pressable inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold transition-colors",
              itemLayout === "equal"
                ? "min-h-11 min-w-0 px-1 py-2 text-center text-xs sm:px-2 sm:text-sm"
                : size === "toolbar"
                  ? "h-9 px-2 text-xs sm:px-3 md:h-10 md:text-sm"
                  : "min-h-11 px-2 py-2 text-sm sm:px-3.5",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-card text-foreground shadow-[var(--shadow-sm)] ring-1 ring-primary/25"
                : "text-muted hover:bg-card/60 hover:text-foreground",
              item.alert && !active && "text-[var(--status-overdue-fg)]",
            )}
            aria-current={active ? "page" : undefined}
          >
            <span className={itemLayout === "equal" ? "truncate" : undefined}>{item.label}</span>
            {item.count != null ? (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
                  active ? "bg-primary/12 text-foreground" : "bg-accent/80 text-muted",
                )}
              >
                {item.count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

export type LocalDestinationNavItem = {
  id: string;
  label: string;
  count?: number;
  alert?: boolean;
  dataAttr?: string;
};

function destinationNavShellClassName(className?: string, itemLayout: "auto" | "equal" = "auto") {
  return cn(
    itemLayout === "equal"
      ? "grid w-full min-w-0 auto-cols-fr grid-flow-col gap-1 rounded-2xl border border-border bg-accent/30 p-1"
      : cn(
          "flex w-full gap-1 rounded-2xl border border-border bg-accent/30 p-1",
          PORTAL_HORIZONTAL_SCROLL_ROW_CLASS,
          "snap-x snap-mandatory scroll-px-1 md:snap-none",
        ),
    className,
  );
}

/** Few tabs share width; wider sets scroll horizontally instead of clipping. */
function destinationNavItemWidthClass(compactItems: boolean) {
  return compactItems ? "shrink-0 whitespace-nowrap" : "min-w-0 flex-1 basis-0";
}

function destinationNavItemClassName({
  active,
  alert,
  size = "default",
  tone = "default",
}: {
  active: boolean;
  alert?: boolean;
  size?: "default" | "toolbar";
  tone?: "default" | "monochrome";
}) {
  return cn(
    "portal-pressable inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold transition-colors",
    size === "toolbar" ? "h-9 px-2 text-xs sm:px-3 md:h-10 md:text-sm" : "min-h-11 px-2 py-2 text-sm sm:px-3.5",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    tone === "monochrome"
      ? active
        ? "text-foreground underline decoration-border underline-offset-4"
        : "text-muted hover:text-foreground"
      : active
        ? "bg-card text-foreground shadow-[var(--shadow-sm)] ring-1 ring-primary/25"
        : "text-muted hover:bg-card/60 hover:text-foreground",
    tone === "default" && alert && !active && "text-[var(--status-overdue-fg)]",
  );
}

function destinationNavCountClassName(active: boolean, tone: "default" | "monochrome" = "default") {
  return cn(
    "rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
    tone === "monochrome"
      ? "bg-transparent text-muted"
      : active
        ? "bg-primary/12 text-foreground"
        : "bg-accent/80 text-muted",
  );
}

/** Local-state destination tabs — same chrome as {@link DestinationNav} without routed hrefs. */
export function LocalDestinationNav({
  items,
  activeId,
  onChange,
  ariaLabel = "Section views",
  className,
  size = "default",
  tone = "default",
}: {
  items: LocalDestinationNavItem[];
  activeId: string;
  onChange: (id: string) => void;
  ariaLabel?: string;
  className?: string;
  size?: "default" | "toolbar";
  tone?: "default" | "monochrome";
}) {
  const compactItems = items.length > 4;

  return (
    <nav
      className={destinationNavShellClassName(className)}
      aria-label={ariaLabel}
      data-slot="local-destination-nav"
      {...{ [HORIZONTAL_SCROLL_ATTR]: "" }}
    >
      {items.map((item) => {
        const active = item.id === activeId;
        return (
          <button
            key={item.id}
            type="button"
            data-attr={item.dataAttr}
            className={cn(
              destinationNavItemWidthClass(compactItems),
              destinationNavItemClassName({ active, alert: item.alert, size, tone }),
            )}
            aria-current={active ? "page" : undefined}
            onClick={() => onChange(item.id)}
          >
            <span>{item.label}</span>
            {item.count != null ? (
              <span className={destinationNavCountClassName(active, tone)}>{item.count}</span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}

