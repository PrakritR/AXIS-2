"use client";

import Link from "next/link";
import { HORIZONTAL_SCROLL_ATTR, PORTAL_HORIZONTAL_SCROLL_ROW_CLASS } from "@/lib/horizontal-scroll";
import { cn } from "@/lib/utils";

export type DestinationNavItem = {
  id: string;
  label: string;
  /** Narrow-viewport label when the full label would clip in equal-width tabs. */
  shortLabel?: string;
  href: string;
  count?: number;
  /** Highlight when this destination has urgent work (overdue, etc.). */
  alert?: boolean;
  dataAttr?: string;
};

/**
 * Routed view switcher — every item is a real URL with a visible label.
 * Mobile: horizontal scroll-snap row; desktop: segmented row.
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
                ? "min-h-10 min-w-0 px-0.5 py-1.5 text-center leading-tight lg:min-h-11 lg:px-2 lg:py-2 lg:text-sm"
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
            <span
              className={
                itemLayout === "equal"
                  ? "block w-full min-w-0 max-w-full whitespace-nowrap text-[length:clamp(9px,2.35vw,0.875rem)] leading-tight lg:truncate"
                  : undefined
              }
            >
              {item.shortLabel ? (
                <>
                  <span className={itemLayout === "equal" ? "lg:hidden" : "lg:hidden"}>{item.shortLabel}</span>
                  <span className={itemLayout === "equal" ? "hidden lg:inline" : "hidden lg:inline"}>{item.label}</span>
                </>
              ) : (
                item.label
              )}
            </span>
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
      ? "grid w-full min-w-0 auto-cols-fr grid-flow-col gap-0.5 rounded-2xl border border-border bg-accent/30 p-1 max-lg:gap-0 max-lg:p-0 max-lg:rounded-none max-lg:border-0 max-lg:bg-transparent"
      : cn(
          "flex w-full gap-1 rounded-2xl border border-border bg-accent/30 p-1",
          PORTAL_HORIZONTAL_SCROLL_ROW_CLASS,
          "max-lg:snap-x max-lg:snap-mandatory max-lg:scroll-px-2.5 sm:max-lg:scroll-px-4 md:snap-none md:scroll-px-1",
        ),
    className,
  );
}

/** Few tabs share width on desktop; on phones always scroll so long labels never clip. */
function destinationNavItemWidthClass(compactItems: boolean) {
  if (compactItems) return "shrink-0 whitespace-nowrap";
  return "min-w-0 flex-1 basis-0 max-lg:shrink-0 max-lg:flex-none max-lg:basis-auto max-lg:whitespace-nowrap";
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
          </button>
        );
      })}
    </nav>
  );
}

