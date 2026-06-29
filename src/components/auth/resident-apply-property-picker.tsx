"use client";

import { useMemo, useState } from "react";
import type { PropertySearchOption } from "@/components/marketing/property-search-picker";
import { usePublicListings } from "@/hooks/use-public-listings";
import { publicListingSearchOptions } from "@/lib/rental-application/public-listing-options";

function normalizeHaystack(option: PropertySearchOption): string {
  return [option.title, option.subtitle, option.searchText, ...(option.tags ?? [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function CheckSmIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function ResidentApplyPropertyPicker({
  value,
  onChange,
  disabled,
}: {
  value: string | null;
  onChange: (propertyId: string | null) => void;
  disabled?: boolean;
}) {
  const { listings, loading } = usePublicListings();
  const [query, setQuery] = useState("");
  const options = useMemo(() => publicListingSearchOptions(listings), [listings]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((option) => normalizeHaystack(option).includes(q));
  }, [options, query]);

  if (loading && options.length === 0) {
    return <p className="text-center text-xs text-muted">Loading available homes…</p>;
  }

  return (
    <div className="space-y-2">
      {options.length > 4 ? (
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by address or neighborhood…"
          disabled={disabled}
          aria-label="Filter available homes"
          className="w-full rounded-2xl border border-border/60 bg-[var(--glass-fill)] px-3.5 py-2.5 text-sm text-foreground outline-none transition-all placeholder:text-muted/60 focus:border-primary/30 focus:bg-card focus:ring-2 focus:ring-primary/25"
        />
      ) : null}

      {options.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
          No homes listed right now. Use an application link from your manager.
        </div>
      ) : (
        <>
          <p className="text-xs text-muted">
            {query.trim()
              ? `${filtered.length} ${filtered.length === 1 ? "match" : "matches"}`
              : `${options.length} ${options.length === 1 ? "home" : "homes"} available`}
          </p>
          <ul
            role="listbox"
            aria-label="Available homes"
            className="resident-property-scroll-list max-h-52 space-y-2 overflow-y-auto overscroll-contain pr-1"
          >
            {filtered.length === 0 ? (
              <li className="rounded-2xl border border-dashed border-border px-4 py-5 text-center text-sm text-muted">
                No homes match your search.
              </li>
            ) : (
              filtered.map((option) => {
                const isSelected = value === option.id;
                return (
                  <li key={option.id} role="option" aria-selected={isSelected}>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onChange(isSelected ? null : option.id)}
                      className={`w-full rounded-2xl border p-3.5 text-left transition-all duration-150 disabled:opacity-50 ${
                        isSelected
                          ? "border-primary/30 bg-primary/5 ring-2 ring-primary/20"
                          : "border-border bg-card hover:border-primary/20 hover:bg-accent/30"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">{option.title}</p>
                          {option.subtitle ? (
                            <p className="mt-0.5 truncate text-xs text-muted">{option.subtitle}</p>
                          ) : null}
                        </div>
                        <div
                          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                            isSelected ? "border-primary bg-primary text-white" : "border-border bg-card"
                          }`}
                        >
                          {isSelected ? <CheckSmIcon /> : null}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </>
      )}
    </div>
  );
}
