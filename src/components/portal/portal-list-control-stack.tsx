"use client";

import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { DestinationNav, type DestinationNavItem } from "@/components/ui/destination-nav";

/**
 * Appendix C1 — Communication-style list chrome, standardized:
 * 1. Full-width filter & sort beside the page primary action
 * 2. Routed destination tab row (segmented)
 * 3. Search scoped to the active destination
 */
export function PortalListControlStack({
  filterRow,
  primaryAction,
  destinations,
  activeDestinationId,
  destinationAriaLabel = "Section views",
  search,
  className,
}: {
  /** Typically {@link PortalFilterSortSheet} (mobile sheet + desktop inline pills). */
  filterRow?: ReactNode;
  primaryAction?: ReactNode;
  destinations?: DestinationNavItem[];
  activeDestinationId?: string;
  destinationAriaLabel?: string;
  search?: {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    dataAttr?: string;
    ariaLabel?: string;
  };
  className?: string;
}) {
  const showFilterPrimary = filterRow || primaryAction;
  const showDestinations = destinations && destinations.length > 0;

  if (!showFilterPrimary && !showDestinations && !search) return null;

  return (
    <div className={`space-y-2 ${className ?? ""}`.trim()} data-slot="portal-list-control-stack">
      {showFilterPrimary ? (
        <div className="flex w-full min-w-0 items-stretch gap-2 max-md:flex-col md:items-center">
          {filterRow ? <div className="min-w-0 flex-1">{filterRow}</div> : null}
          {primaryAction ? (
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 max-md:w-full max-md:[&_button]:flex-1">
              {primaryAction}
            </div>
          ) : null}
        </div>
      ) : null}
      {showDestinations ? (
        <DestinationNav
          items={destinations}
          activeId={activeDestinationId}
          ariaLabel={destinationAriaLabel}
        />
      ) : null}
      {search ? (
        <Input
          type="search"
          value={search.value}
          onChange={(e) => search.onChange(e.target.value)}
          placeholder={search.placeholder}
          aria-label={search.ariaLabel ?? search.placeholder}
          className="portal-list-search h-9 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/15"
          data-attr={search.dataAttr ?? "portal-list-search"}
        />
      ) : null}
    </div>
  );
}
