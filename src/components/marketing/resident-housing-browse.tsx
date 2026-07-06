"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { usePublicListings } from "@/hooks/use-public-listings";
import {
  buildPropertyBrowseCards,
  type PropertyBrowseCard,
} from "@/lib/room-listings-catalog";

const BUDGET_MIN = 500;
const BUDGET_MAX = 6500;
const BUDGET_STEP = 100;

function formatRent(card: PropertyBrowseCard): string {
  if (card.rentNumeric !== null) {
    return `$${card.rentNumeric.toLocaleString("en-US")}`;
  }
  const stripped = card.priceLabel.replace(/\/month/i, "").trim();
  return stripped || "—";
}

function BrowseSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-4">
      {Array.from({ length: 8 }, (_, i) => (
        <div
          key={i}
          className="aspect-[3/4] animate-pulse rounded-2xl bg-gradient-to-br from-accent/40 to-accent/10"
        />
      ))}
    </div>
  );
}

function HousingBrowseCard({ card }: { card: PropertyBrowseCard }) {
  const rent = formatRent(card);
  const isDataUrl = card.imageUrl.startsWith("data:");

  return (
    <Link
      href={`/rent/listings/${encodeURIComponent(card.propertyId)}`}
      data-attr="resident-browse-listing-card"
      className="group relative block overflow-hidden rounded-2xl bg-accent/20 shadow-sm ring-1 ring-border/40 transition duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:ring-primary/30"
    >
      <div className="relative aspect-[3/4] w-full overflow-hidden">
        <Image
          src={card.imageUrl}
          alt=""
          fill
          className="object-cover transition duration-500 group-hover:scale-[1.03]"
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          unoptimized={isDataUrl}
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-3 sm:p-3.5">
          <p className="text-lg font-bold tracking-tight text-white sm:text-xl">{rent}</p>
          <p className="text-[11px] font-medium text-white/75 sm:text-xs">/ month</p>
        </div>
        {card.petFriendly ? (
          <span className="absolute left-2.5 top-2.5 rounded-full bg-black/45 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
            Pets OK
          </span>
        ) : null}
      </div>
      <div className="sr-only">
        {card.headlineAddress}, {card.neighborhood}, {rent} per month
      </div>
    </Link>
  );
}

export function ResidentHousingBrowse() {
  const { listings, loading } = usePublicListings();
  const [maxBudget, setMaxBudget] = useState(BUDGET_MAX);

  const allCards = useMemo(() => buildPropertyBrowseCards(listings), [listings]);

  const cards = useMemo(() => {
    if (maxBudget >= BUDGET_MAX) return allCards;
    return allCards.filter((c) => c.rentNumeric === null || c.rentNumeric <= maxBudget);
  }, [allCards, maxBudget]);

  const budgetActive = maxBudget < BUDGET_MAX;
  const budgetLabel = budgetActive ? `$${maxBudget.toLocaleString()}` : "Any";

  return (
    <div className="w-full">
      <div className="sticky top-[calc(env(safe-area-inset-top)+3.5rem)] z-20 -mx-1 mb-4 rounded-2xl border border-border/50 bg-background/85 px-3 py-3 backdrop-blur-md sm:top-16 sm:px-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">
              {loading ? "Loading homes…" : `${cards.length} homes available`}
            </p>
            <p className="text-xs text-muted">Sorted by price · lowest first</p>
          </div>
          <div className="flex min-w-[10rem] flex-1 flex-col gap-1 sm:max-w-xs sm:flex-none">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                Max budget
              </span>
              <span className={`text-xs font-semibold ${budgetActive ? "text-primary" : "text-muted"}`}>
                {budgetLabel}
              </span>
            </div>
            <input
              type="range"
              min={BUDGET_MIN}
              max={BUDGET_MAX}
              step={BUDGET_STEP}
              value={maxBudget}
              onChange={(e) => setMaxBudget(Number(e.target.value))}
              aria-label="Maximum monthly budget"
              data-attr="resident-browse-budget"
              className="h-2 w-full cursor-pointer accent-primary"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <BrowseSkeleton />
      ) : cards.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/70 px-6 py-16 text-center">
          <p className="text-base font-semibold text-foreground">No homes match right now</p>
          <p className="mt-2 text-sm text-muted">
            {budgetActive
              ? "Try raising your budget — new listings are added as managers publish."
              : "Check back soon — managers add listings as they go live."}
          </p>
          {budgetActive ? (
            <button
              type="button"
              onClick={() => setMaxBudget(BUDGET_MAX)}
              data-attr="resident-browse-clear-budget"
              className="mt-4 text-sm font-semibold text-primary hover:underline"
            >
              Show all prices
            </button>
          ) : null}
        </div>
      ) : (
        <div
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-4"
          aria-label="Available rental homes"
        >
          {cards.map((card) => (
            <HousingBrowseCard key={card.propertyId} card={card} />
          ))}
        </div>
      )}
    </div>
  );
}
