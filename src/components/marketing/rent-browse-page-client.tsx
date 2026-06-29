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
    <div className="native-auth-screen min-h-[100dvh] px-4 py-6 sm:py-10">
      <div className="mx-auto w-full max-w-lg">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:opacity-90"
        >
          ← Back
        </Link>

        <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground">Browse properties</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Tap a home to view the listing and start your application.
        </p>

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
              <p className="text-xs text-muted">
                {query.trim()
                  ? `${filtered.length} ${filtered.length === 1 ? "match" : "matches"}`
                  : `${options.length} ${options.length === 1 ? "home" : "homes"} available`}
              </p>
              <ul className="space-y-2" aria-label="Available homes">
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
                        className="w-full rounded-2xl border border-border/60 bg-card/50 px-4 py-3.5 text-left transition hover:border-primary/25 hover:bg-card"
                      >
                        <p className="text-sm font-semibold text-foreground">{option.title}</p>
                        {option.subtitle ? (
                          <p className="mt-0.5 text-xs text-muted">{option.subtitle}</p>
                        ) : null}
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
