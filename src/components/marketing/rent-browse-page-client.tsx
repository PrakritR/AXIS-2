"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import type { PropertySearchOption } from "@/components/marketing/property-search-picker";
import { usePublicListings } from "@/hooks/use-public-listings";
import { useIsNativeApp } from "@/hooks/use-is-native-app";
import { publicListingSearchOptions } from "@/lib/rental-application/public-listing-options";

function authCreateResidentPath() {
  return "/auth/sign-in?mode=create&role=resident";
}

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

export function RentBrowsePageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromAuth = searchParams.get("from") === "auth";
  const { isNative } = useIsNativeApp();
  const { listings, loading } = usePublicListings();
  const [query, setQuery] = useState("");

  const options = useMemo(() => publicListingSearchOptions(listings), [listings]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((option) => normalizeHaystack(option).includes(q));
  }, [options, query]);

  const backHref = fromAuth || isNative ? authCreateResidentPath() : "/";

  const openListing = (propertyId: string) => {
    router.push(`/rent/listings/${encodeURIComponent(propertyId)}`);
  };

  return (
    <div className="native-auth-screen min-h-[100dvh] px-4 py-6 [html[data-native]_&]:pt-[max(1.5rem,env(safe-area-inset-top))] [html[data-native]_&]:pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:py-10">
      <div className="mx-auto w-full max-w-lg">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:opacity-90"
        >
          ← Back
        </Link>

        <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground">Browse properties</h1>

        <div className="mt-6 space-y-3">
          {options.length > 3 ? (
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by address or neighborhood…"
              aria-label="Search available homes"
              className="w-full rounded-2xl border border-border/60 bg-[var(--glass-fill)] px-3.5 py-2.5 text-sm text-foreground outline-none transition-all placeholder:text-muted/60 focus:border-primary/30 focus:bg-card focus:ring-2 focus:ring-primary/25"
            />
          ) : null}

          {loading && options.length === 0 ? (
            <p className="text-sm text-muted">Loading available homes…</p>
          ) : options.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
              No homes available right now. Ask your property manager for an application link.
            </div>
          ) : (
            <>
              {query.trim() ? (
                <p className="text-xs text-muted">
                  {filtered.length} {filtered.length === 1 ? "match" : "matches"}
                </p>
              ) : null}
              <ul className="space-y-3" aria-label="Available homes">
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
                        className="flex w-full items-center gap-3 rounded-2xl border border-border/60 bg-card/50 p-3 text-left transition hover:border-primary/25 hover:bg-card [html[data-theme=dark]_&]:border-white/10 [html[data-theme=dark]_&]:bg-white/[0.05] sm:gap-4 sm:p-3.5"
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
    </div>
  );
}
