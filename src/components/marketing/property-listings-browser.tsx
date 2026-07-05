"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { PropertySearchOption } from "@/components/marketing/property-search-picker";
import { usePublicListings } from "@/hooks/use-public-listings";
import { propertyMatchesMinBeds, propertyWithinMaxBudget } from "@/lib/listings-search";
import { publicListingSearchOptions } from "@/lib/rental-application/public-listing-options";

const MAX_PRICE_OPTIONS = [
  { label: "Any price", value: "" },
  { label: "Up to $1,500", value: "1500" },
  { label: "Up to $2,000", value: "2000" },
  { label: "Up to $2,500", value: "2500" },
  { label: "Up to $3,000", value: "3000" },
  { label: "Up to $4,000", value: "4000" },
] as const;

const MIN_BEDS_OPTIONS = [
  { label: "Any beds", value: "" },
  { label: "Studio+", value: "0" },
  { label: "1+ bed", value: "1" },
  { label: "2+ beds", value: "2" },
  { label: "3+ beds", value: "3" },
] as const;

function normalizeHaystack(option: PropertySearchOption): string {
  return [option.title, option.subtitle, option.searchText, ...(option.tags ?? [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function ListingThumbnail({ imageUrl, title }: { imageUrl?: string; title: string }) {
  return (
    <div className="relative h-[4.5rem] w-[5.5rem] shrink-0 overflow-hidden rounded-xl border border-border/60 bg-accent/30 [html[data-theme=dark]_&]:border-white/10 [html[data-theme=dark]_&]:bg-white/[0.06] sm:h-20 sm:w-24">
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- listing photos may be data URLs from manager uploads
        <img src={imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-1 text-muted" aria-hidden>
          <svg className="h-5 w-5 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 20h16M6 16l4-5 4 3 4-6 2 3" strokeLinecap="round" strokeLinejoin="round" />
            <rect x="3" y="4" width="18" height="16" rx="2" />
          </svg>
          <span className="text-[9px] font-semibold uppercase tracking-wide opacity-70">Home</span>
        </div>
      )}
      <span className="sr-only">{title}</span>
    </div>
  );
}

export type PropertyListingsBrowserProps = {
  /** Prefix for PostHog `data-attr` names so home-section vs /rent instrumentation stay distinguishable. */
  analyticsPrefix: string;
  /** Container classes for the search/filter row. */
  className?: string;
  /** Classes for the `<ul>` results list — pass a grid for wider layouts, defaults to a stacked list. */
  listClassName?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
};

/**
 * Shared search + filter + results list over the public listing catalog.
 * Used by the `/rent` full browse page and the home page "Properties" section
 * so both stay backed by the same data and filtering behavior.
 */
export function PropertyListingsBrowser({
  analyticsPrefix,
  className,
  listClassName = "space-y-3",
  searchPlaceholder = "Search by address or neighborhood…",
  emptyMessage = "No homes available right now. Ask your property manager for an application link.",
}: PropertyListingsBrowserProps) {
  const router = useRouter();
  const { listings, loading } = usePublicListings();
  const [query, setQuery] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [minBeds, setMinBeds] = useState("");

  const propertyById = useMemo(() => new Map(listings.map((p) => [p.id, p] as const)), [listings]);
  const options = useMemo(() => publicListingSearchOptions(listings), [listings]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const maxPriceNum = maxPrice ? Number.parseInt(maxPrice, 10) : null;
    const minBedsNum = minBeds ? Number.parseInt(minBeds, 10) : null;
    return options.filter((option) => {
      if (q && !normalizeHaystack(option).includes(q)) return false;
      const property = propertyById.get(option.id);
      if (!property) return false;
      if (!propertyWithinMaxBudget(property.rentLabel, maxPriceNum)) return false;
      if (!propertyMatchesMinBeds(property.beds, minBedsNum)) return false;
      return true;
    });
  }, [options, propertyById, query, maxPrice, minBeds]);

  const isFiltered = query.trim() !== "" || maxPrice !== "" || minBeds !== "";
  const openListing = (propertyId: string) => router.push(`/rent/listings/${encodeURIComponent(propertyId)}`);
  const selectClassName =
    "rounded-2xl border border-border/60 bg-[var(--glass-fill)] px-3 py-2.5 text-sm text-foreground outline-none transition-all focus:border-primary/30 focus:bg-card focus:ring-2 focus:ring-primary/25";

  return (
    <div className={className}>
      <div className="space-y-3">
        {options.length > 3 ? (
          <div className="flex flex-wrap gap-2">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label="Search available homes"
              data-attr={`${analyticsPrefix}-search-input`}
              className="min-w-[12rem] flex-1 rounded-2xl border border-border/60 bg-[var(--glass-fill)] px-3.5 py-2.5 text-sm text-foreground outline-none transition-all placeholder:text-muted/60 focus:border-primary/30 focus:bg-card focus:ring-2 focus:ring-primary/25"
            />
            <select
              value={minBeds}
              onChange={(e) => setMinBeds(e.target.value)}
              aria-label="Minimum bedrooms"
              data-attr={`${analyticsPrefix}-beds-filter`}
              className={selectClassName}
            >
              {MIN_BEDS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <select
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              aria-label="Maximum price"
              data-attr={`${analyticsPrefix}-price-filter`}
              className={selectClassName}
            >
              {MAX_PRICE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {loading && options.length === 0 ? (
          <p className="text-sm text-muted">Loading available homes…</p>
        ) : options.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
            {emptyMessage}
          </div>
        ) : (
          <>
            {isFiltered ? (
              <p className="text-xs text-muted">
                {filtered.length} {filtered.length === 1 ? "match" : "matches"}
              </p>
            ) : null}
            <ul className={listClassName} aria-label="Available homes">
              {filtered.length === 0 ? (
                <li className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
                  No homes match your search.
                </li>
              ) : (
                filtered.map((option) => (
                  <li key={option.id}>
                    <button
                      type="button"
                      onClick={() => openListing(option.id)}
                      data-attr={`${analyticsPrefix}-listing-card`}
                      className="flex h-full w-full items-center gap-3 rounded-2xl border border-border/60 bg-card/50 p-3 text-left transition hover:border-primary/25 hover:bg-card [html[data-theme=dark]_&]:border-white/10 [html[data-theme=dark]_&]:bg-white/[0.05] sm:gap-4 sm:p-3.5"
                    >
                      <ListingThumbnail imageUrl={option.imageUrl} title={option.title} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold leading-snug text-foreground">{option.title}</p>
                        {option.subtitle ? (
                          <p className="mt-1 text-xs leading-relaxed text-muted">{option.subtitle}</p>
                        ) : null}
                        {option.tags?.length ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {option.tags.map((tag) => (
                              <span
                                key={tag}
                                className="rounded-full border border-border/60 bg-accent/30 px-2 py-0.5 text-[10px] font-semibold text-muted"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <span className="shrink-0 text-lg text-muted/50" aria-hidden>
                        ›
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
