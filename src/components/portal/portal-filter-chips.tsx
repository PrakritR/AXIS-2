"use client";

import { cn } from "@/lib/utils";

export type PortalFilterChipOption = {
  id: string;
  label: string;
  count?: number;
};

/**
 * Visible filter/sort chips (Appendix E1) — no dropdowns for navigation or filtering.
 */
export function PortalFilterChipRow({
  options,
  value,
  onChange,
  ariaLabel = "Filters",
  className,
  allowAll = true,
  allLabel = "All",
}: {
  options: PortalFilterChipOption[];
  value: string;
  onChange: (id: string) => void;
  ariaLabel?: string;
  className?: string;
  allowAll?: boolean;
  allLabel?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn("flex w-full flex-wrap gap-1.5", className)}
      data-slot="portal-filter-chip-row"
    >
      {allowAll ? (
        <button
          type="button"
          onClick={() => onChange("")}
          className={cn(
            "portal-pressable min-h-9 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors",
            value === ""
              ? "border-primary/30 bg-card text-foreground shadow-[var(--shadow-sm)]"
              : "border-border bg-accent/30 text-muted hover:text-foreground",
          )}
        >
          {allLabel}
        </button>
      ) : null}
      {options.map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={cn(
              "portal-pressable min-h-9 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors",
              active
                ? "border-primary/30 bg-card text-foreground shadow-[var(--shadow-sm)]"
                : "border-border bg-accent/30 text-muted hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/** Toggle chips for multi-select filters (empty selection = no restriction). */
export function PortalMultiFilterChipRow({
  label,
  options,
  selected,
  onChange,
  ariaLabel = "Filters",
}: {
  label?: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (selected: string[]) => void;
  ariaLabel?: string;
}) {
  const toggle = (value: string) => {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  };

  const body = (
    <div role="group" aria-label={ariaLabel} className="flex w-full flex-wrap gap-1.5">
      {options.map((opt) => {
        const active = selected.includes(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => toggle(opt.value)}
            className={cn(
              "portal-pressable min-h-9 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors",
              active
                ? "border-primary/30 bg-card text-foreground shadow-[var(--shadow-sm)]"
                : "border-border bg-accent/30 text-muted hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );

  if (!label) return body;

  return (
    <div className="space-y-1.5" data-slot="portal-multi-filter-chip-row">
      <p className="text-xs font-semibold text-muted">{label}</p>
      {body}
    </div>
  );
}

export type PortalActiveFilterChip = {
  id: string;
  label: string;
  onRemove: () => void;
};

/** Removable chips for active filters (Appendix F band 3, below find row). */
export function PortalActiveFilterChips({ chips }: { chips: PortalActiveFilterChip[] }) {
  if (chips.length === 0) return null;
  return (
    <div
      className="flex flex-wrap gap-1.5"
      data-slot="portal-active-filter-chips"
      role="list"
      aria-label="Active filters"
    >
      {chips.map((chip) => (
        <button
          key={chip.id}
          type="button"
          role="listitem"
          onClick={chip.onRemove}
          className="portal-pressable inline-flex min-h-8 items-center gap-1 rounded-full border border-primary/25 bg-primary/5 px-2.5 py-1 text-xs font-semibold text-foreground"
        >
          {chip.label}
          <span aria-hidden="true">×</span>
        </button>
      ))}
    </div>
  );
}

/** Sort options as a labelled chip row (replaces PortalToolbarSortSelect). */
export function PortalSortChipRow<T extends string>({
  label = "Sort",
  options,
  value,
  onChange,
  ariaLabel = "Sort",
}: {
  label?: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div className="space-y-1.5" data-slot="portal-sort-chip-row">
      <p className="text-xs font-semibold text-muted">{label}</p>
      <div role="group" aria-label={ariaLabel} className="flex w-full flex-wrap gap-1.5">
        {options.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={cn(
                "portal-pressable min-h-9 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors",
                active
                  ? "border-primary/30 bg-card text-foreground shadow-[var(--shadow-sm)]"
                  : "border-border bg-accent/30 text-muted hover:text-foreground",
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
