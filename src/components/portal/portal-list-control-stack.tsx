"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { DestinationNav, type DestinationNavItem } from "@/components/ui/destination-nav";
import { syncPortalMobileTopChrome } from "@/lib/portal-mobile-top-chrome";
import { cn } from "@/lib/utils";

/**
 * Appendix F — Communication-style list chrome (exactly three bands above data):
 * 1. Title + axis switch + actions — {@link ManagerPortalPageShell} / {@link PageHeader}
 * 2. Routed destination tabs with counts — `destinations` below
 * 3. Filter & sort + search — `filterRow` + `search`; active filters as `activeFilterChips`
 */
export function PortalListControlStack({
  filterRow,
  /**
   * @deprecated Pass actions via `titleAside` on {@link ManagerPortalPageShell} (Appendix F band 1).
   */
  primaryAction: _primaryAction,
  destinations,
  activeDestinationId,
  destinationAriaLabel = "Section views",
  destinationRow,
  search,
  activeFilterChips,
  className,
  /** When true, destination tabs respect page horizontal padding on mobile (no bleed). */
  destinationInset = false,
}: {
  /** Typically {@link PortalFilterSortSheet} (mobile sheet; optional desktop inline pills or panel modal). */
  filterRow?: ReactNode;
  primaryAction?: ReactNode;
  destinations?: DestinationNavItem[];
  activeDestinationId?: string;
  destinationAriaLabel?: string;
  /** When set, renders instead of {@link DestinationNav} (e.g. local-state pill rows). */
  destinationRow?: ReactNode;
  search?: {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    dataAttr?: string;
    ariaLabel?: string;
  };
  /** Removable chips when filters are active (Appendix F band 3). */
  activeFilterChips?: ReactNode;
  className?: string;
  destinationInset?: boolean;
}) {
  const showDestinations = Boolean(destinationRow) || (destinations && destinations.length > 0);
  const showFindRow = Boolean(filterRow || search);
  const destinationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = destinationRef.current;
    if (!el || !showDestinations) return;
    const sync = () => syncPortalMobileTopChrome(el);
    sync();
    const ro = new ResizeObserver(sync);
    const main = el.closest("#portal-main-content");
    const mobileBar = main?.querySelector(".portal-mobile-nav-bar");
    if (mobileBar) ro.observe(mobileBar);
    ro.observe(el);
    window.addEventListener("resize", sync);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", sync);
      const mobileBar = main?.querySelector<HTMLElement>(".portal-mobile-nav-bar");
      if (mobileBar) syncPortalMobileTopChrome(mobileBar);
    };
  }, [showDestinations]);

  if (!showDestinations && !showFindRow && !activeFilterChips) return null;

  return (
    <div className={cn("space-y-2.5 max-lg:space-y-2", className)} data-slot="portal-list-control-stack">
      {showDestinations ? (
        <div
          ref={destinationRef}
          data-portal-list-destination-nav
          className={cn(
            "sticky z-[38] bg-background/95 backdrop-blur-md lg:static lg:mx-0",
            destinationInset ? "mx-0" : "-mx-2.5 sm:-mx-4",
            "[top:var(--portal-mobile-top-chrome,0px)]",
            "lg:bg-transparent lg:backdrop-blur-none",
          )}
        >
          {destinationRow ?? (
            <DestinationNav
              items={destinations!}
              activeId={activeDestinationId}
              ariaLabel={destinationAriaLabel}
              className={cn(
                "max-lg:rounded-none max-lg:border-0 max-lg:border-b max-lg:border-border max-lg:bg-transparent",
                destinationInset ? "max-lg:gap-1.5 max-lg:p-1" : "max-lg:gap-1.5 max-lg:p-0",
              )}
            />
          )}
        </div>
      ) : null}
      {showFindRow ? (
        <div className="flex w-full min-w-0 items-stretch gap-2 max-md:flex-col md:items-center">
          {filterRow ? <div className="min-w-0 flex-1">{filterRow}</div> : null}
          {search ? (
            <div
              className={cn(
                "min-w-0",
                filterRow ? "w-full md:max-w-[14rem] md:shrink-0" : "flex-1",
              )}
            >
              <Input
                type="search"
                value={search.value}
                onChange={(e) => search.onChange(e.target.value)}
                placeholder={search.placeholder}
                aria-label={search.ariaLabel ?? search.placeholder}
                className="portal-list-search h-9 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/15"
                data-attr={search.dataAttr ?? "portal-list-search"}
              />
            </div>
          ) : null}
        </div>
      ) : null}
      {activeFilterChips ? <div className="min-w-0">{activeFilterChips}</div> : null}
    </div>
  );
}
