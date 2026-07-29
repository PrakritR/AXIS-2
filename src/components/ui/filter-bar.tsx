"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type FilterBarPill = {
  id: string;
  label: string;
  active?: boolean;
  onClick?: () => void;
  /** Opens a menu/dropdown — render via `menu` slot. */
  hasMenu?: boolean;
  menu?: ReactNode;
  dataAttr?: string;
};

export type FilterBarChip = {
  id: string;
  label: string;
  onRemove: () => void;
};

export const FILTER_BAR_PILL_CLASS =
  "inline-flex min-h-11 min-w-0 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-sm font-medium text-foreground transition hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export const FILTER_BAR_PILL_ACTIVE_CLASS = "border-primary/35 bg-primary/10 text-foreground ring-1 ring-primary/20";

export function FilterBar({
  pills,
  chips,
  primaryAction,
  className,
}: {
  pills: FilterBarPill[];
  chips?: FilterBarChip[];
  /** Visually distinct primary action — always last in the row. */
  primaryAction?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 space-y-2", className)} data-slot="filter-bar">
      <div
        className="flex min-w-0 flex-wrap items-center gap-2 max-md:-mx-1 max-md:flex-nowrap max-md:overflow-x-auto max-md:snap-x max-md:snap-mandatory max-md:scroll-px-1 max-md:[scrollbar-width:none] max-md:[-ms-overflow-style:none] max-md:[&::-webkit-scrollbar]:hidden"
      >
        {pills.map((pill) => (
          <div key={pill.id} className="relative shrink-0 max-md:snap-start">
            {pill.menu ? (
              pill.menu
            ) : (
              <button
                type="button"
                data-attr={pill.dataAttr}
                onClick={pill.onClick}
                className={cn(
                  FILTER_BAR_PILL_CLASS,
                  "portal-pressable",
                  pill.active && FILTER_BAR_PILL_ACTIVE_CLASS,
                )}
              >
                {pill.label}
              </button>
            )}
          </div>
        ))}
        {primaryAction ? <div className="ml-auto shrink-0">{primaryAction}</div> : null}
      </div>
      {chips && chips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5" data-slot="filter-bar-chips">
          {chips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={chip.onRemove}
              className="inline-flex min-h-8 max-w-full items-center gap-1 rounded-full border border-border bg-accent/40 pl-2.5 pr-1.5 text-xs font-medium text-foreground transition hover:bg-accent/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="truncate">{chip.label}</span>
              <X className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
              <span className="sr-only">Remove filter</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
