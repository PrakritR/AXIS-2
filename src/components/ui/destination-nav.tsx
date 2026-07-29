"use client";

import Link from "next/link";
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
}: {
  items: DestinationNavItem[];
  /** Match the active item by normalized href. */
  activeHref?: string;
  /** Match the active item by id (for grouped routes under one parent). */
  activeId?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const normalize = (href: string) => href.replace(/\/$/, "");

  return (
    <nav
      className={cn(
        "flex w-full gap-1 overflow-x-auto rounded-2xl border border-border bg-accent/30 p-1",
        "[scrollbar-width:none] [-ms-overflow-style:none] snap-x snap-mandatory scroll-px-1 [&::-webkit-scrollbar]:hidden",
        "md:flex md:overflow-visible md:snap-none",
        className,
      )}
      aria-label={ariaLabel}
      data-slot="destination-nav"
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
              "portal-pressable inline-flex min-h-11 flex-1 basis-0 justify-center items-center gap-1.5 rounded-xl px-2 py-2 text-sm font-semibold transition-colors sm:px-3.5",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-card text-foreground shadow-[var(--shadow-sm)] ring-1 ring-primary/25"
                : "text-muted hover:bg-card/60 hover:text-foreground",
              item.alert && !active && "text-[var(--status-overdue-fg)]",
            )}
            aria-current={active ? "page" : undefined}
          >
            <span>{item.label}</span>
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
