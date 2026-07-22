"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  RESIDENT_BATHROOM_OPTIONS,
  RESIDENT_HOUSING_BUDGET_MAX,
  RESIDENT_HOUSING_BUDGET_MIN,
  RESIDENT_HOUSING_BUDGET_STEP,
  RESIDENT_HOUSING_INPUT_CLS,
  RESIDENT_ROOM_TYPE_OPTIONS,
  ResidentHousingChat,
  ResidentHousingFieldBlock,
  type HousingChatAppliedFilters,
} from "@/components/marketing/resident-listing-search";
import { usePublicListings } from "@/hooks/use-public-listings";
import { HousingBrowseSwipeStack } from "@/components/marketing/housing-browse-swipe-stack";
import {
  buildPropertyBrowseCards,
  demoOnlyBrowseCardPlaceholderImage,
  type BrowseSortId,
  type PropertyBrowseCard,
} from "@/lib/room-listings-catalog";
import { isDemoModeActive } from "@/lib/demo/demo-session";
import { formatRoomPriceAmount } from "@/lib/room-pricing";
import { NoImagePlaceholder } from "@/components/ui/no-image-placeholder";

const SORT_OPTIONS: { id: BrowseSortId; label: string }[] = [
  { id: "price-asc", label: "Price · lowest first" },
  { id: "price-desc", label: "Price · highest first" },
  { id: "neighborhood", label: "Neighborhood A–Z" },
];

function clampBudget(n: number) {
  const stepped = Math.round(n / RESIDENT_HOUSING_BUDGET_STEP) * RESIDENT_HOUSING_BUDGET_STEP;
  return Math.min(RESIDENT_HOUSING_BUDGET_MAX, Math.max(RESIDENT_HOUSING_BUDGET_MIN, stepped));
}

function formatRent(card: PropertyBrowseCard): string {
  const display = card.headlineRent ?? card.rentNumeric;
  if (display !== null) {
    return formatRoomPriceAmount(display);
  }
  const stripped = card.priceLabel.replace(/\/month/i, "").replace(/\/day/i, "").trim();
  return stripped || "—";
}

function periodSuffix(card: PropertyBrowseCard): string {
  return card.pricePeriod === "day" ? " / day" : " / month";
}

function sortLabel(sort: BrowseSortId): string {
  return SORT_OPTIONS.find((o) => o.id === sort)?.label ?? "Price · lowest first";
}

function BrowseSkeleton() {
  return (
    <>
      <div className="lg:hidden" aria-hidden>
        <div className="mx-auto h-[min(62dvh,520px)] w-full max-w-[min(100%,22rem)] animate-pulse rounded-3xl bg-gradient-to-br from-accent/40 to-accent/10" />
      </div>
      <div
        className="hidden gap-4 pb-2 lg:grid lg:grid-cols-3"
        aria-hidden
      >
        {Array.from({ length: 3 }, (_, i) => (
          <div
            key={i}
            className="aspect-[3/4] min-h-[320px] animate-pulse rounded-2xl bg-gradient-to-br from-accent/40 to-accent/10"
          />
        ))}
      </div>
    </>
  );
}

function HousingBrowseCard({
  card,
  variant = "compact",
}: {
  card: PropertyBrowseCard;
  variant?: "compact" | "carousel";
}) {
  const rent = formatRent(card);
  const isCarousel = variant === "carousel";
  const resolvedImageUrl =
    card.imageUrl || (isDemoModeActive() ? demoOnlyBrowseCardPlaceholderImage(card.propertyId) : "");
  const isDataUrl = resolvedImageUrl.startsWith("data:");

  return (
    <Link
      href={`/rent/listings/${encodeURIComponent(card.propertyId)}`}
      data-attr="resident-browse-listing-card"
      className={`group relative block overflow-hidden rounded-2xl bg-accent/20 shadow-sm ring-1 ring-border/40 transition duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:ring-primary/30 ${
        isCarousel
          ? "h-full w-full"
          : "w-[min(42vw,220px)] shrink-0 snap-start sm:w-[220px]"
      }`}
    >
      <div className={`relative w-full overflow-hidden ${isCarousel ? "aspect-[3/4] min-h-[320px]" : "aspect-[3/4]"}`}>
        {resolvedImageUrl ? (
          <Image
            src={resolvedImageUrl}
            alt=""
            fill
            className="object-cover transition duration-500 group-hover:scale-[1.03]"
            sizes={isCarousel ? "(max-width: 1280px) 30vw, 360px" : "220px"}
            unoptimized={isDataUrl}
          />
        ) : (
          <NoImagePlaceholder />
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
        <div className={`absolute inset-x-0 bottom-0 ${isCarousel ? "p-4 sm:p-5" : "p-3 sm:p-3.5"}`}>
          {isCarousel ? (
            <>
              <p className="text-sm font-semibold text-white/90">{card.neighborhood}</p>
              <p className="mt-0.5 line-clamp-1 text-base font-semibold text-white">{card.headlineAddress}</p>
            </>
          ) : null}
          <p className={`font-bold tracking-tight text-white ${isCarousel ? "mt-2 text-2xl sm:text-3xl" : "text-lg sm:text-xl"}`}>
            {rent}
          </p>
          <p className="text-[11px] font-medium text-white/75 sm:text-xs">{periodSuffix(card)}</p>
        </div>
        {card.petFriendly ? (
          <span className="absolute left-2.5 top-2.5 rounded-full bg-black/45 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
            Pets OK
          </span>
        ) : null}
      </div>
      <div className="sr-only">
        {card.headlineAddress}, {card.neighborhood}, {rent}{card.pricePeriod === "day" ? " per day" : " per month"}
      </div>
    </Link>
  );
}

function CarouselArrow({
  direction,
  disabled,
  onClick,
}: {
  direction: "left" | "right";
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={direction === "left" ? "Previous homes" : "Next homes"}
      data-attr={direction === "left" ? "resident-browse-carousel-prev" : "resident-browse-carousel-next"}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border/60 bg-card/80 text-foreground shadow-sm backdrop-blur-sm transition hover:border-primary/35 hover:bg-card disabled:cursor-not-allowed disabled:opacity-35"
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden>
        {direction === "left" ? (
          <path d="M14 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path d="M10 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        )}
      </svg>
    </button>
  );
}

function HousingBrowseCarousel({ cards }: { cards: PropertyBrowseCard[] }) {
  const [startIndex, setStartIndex] = useState(0);
  const visibleCount = 3;
  const maxStart = Math.max(0, cards.length - visibleCount);
  const cardKey = cards.map((c) => c.propertyId).join(",");

  useEffect(() => {
    setStartIndex(0);
  }, [cardKey]);

  useEffect(() => {
    if (startIndex > maxStart) setStartIndex(maxStart);
  }, [startIndex, maxStart]);

  const visible = cards.slice(startIndex, startIndex + visibleCount);
  const placeholders = Math.max(0, visibleCount - visible.length);

  return (
    <div className="flex items-center gap-3 sm:gap-4">
      <CarouselArrow
        direction="left"
        disabled={startIndex <= 0}
        onClick={() => setStartIndex((i) => Math.max(0, i - 1))}
      />
      <div className="grid min-w-0 flex-1 grid-cols-3 gap-4" aria-label="Available rental homes">
        {visible.map((card) => (
          <HousingBrowseCard key={card.propertyId} card={card} variant="carousel" />
        ))}
        {Array.from({ length: placeholders }, (_, i) => (
          <div key={`pad-${i}`} aria-hidden className="hidden sm:block" />
        ))}
      </div>
      <CarouselArrow
        direction="right"
        disabled={startIndex >= maxStart}
        onClick={() => setStartIndex((i) => Math.min(maxStart, i + 1))}
      />
    </div>
  );
}

function BrowseManualFilters({
  moveIn,
  setMoveIn,
  moveOut,
  setMoveOut,
  budget,
  setBudget,
  bathroom,
  setBathroom,
  roomType,
  setRoomType,
  activeCount,
  onClear,
}: {
  moveIn: string;
  setMoveIn: (v: string) => void;
  moveOut: string;
  setMoveOut: (v: string) => void;
  budget: number;
  setBudget: (v: number) => void;
  bathroom: string;
  setBathroom: (v: string) => void;
  roomType: string;
  setRoomType: (v: string) => void;
  activeCount: number;
  onClear: () => void;
}) {
  const budgetActive = budget < RESIDENT_HOUSING_BUDGET_MAX;
  const budgetLabel = budgetActive ? `$${budget.toLocaleString()}` : "Any";

  return (
    <div className="min-w-0 space-y-4">
      <div className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-5 lg:grid-cols-5">
        <ResidentHousingFieldBlock label="Move-in date">
          <input
            type="date"
            value={moveIn}
            onChange={(e) => setMoveIn(e.target.value)}
            data-attr="resident-browse-move-in"
            className={`${RESIDENT_HOUSING_INPUT_CLS} hero-search-date-input min-w-0 max-w-full`}
          />
        </ResidentHousingFieldBlock>
        <ResidentHousingFieldBlock label="Move-out date">
          <input
            type="date"
            value={moveOut}
            onChange={(e) => setMoveOut(e.target.value)}
            data-attr="resident-browse-move-out"
            className={`${RESIDENT_HOUSING_INPUT_CLS} hero-search-date-input min-w-0 max-w-full`}
          />
        </ResidentHousingFieldBlock>
        <ResidentHousingFieldBlock label="Room type">
          <select
            value={roomType}
            onChange={(e) => setRoomType(e.target.value)}
            aria-label="Room type"
            data-attr="resident-browse-room-type"
            className={RESIDENT_HOUSING_INPUT_CLS}
          >
            {RESIDENT_ROOM_TYPE_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </ResidentHousingFieldBlock>
        <ResidentHousingFieldBlock label="Shared bathroom">
          <select
            value={bathroom}
            onChange={(e) => setBathroom(e.target.value)}
            aria-label="Shared bathroom"
            data-attr="resident-browse-bathroom"
            className={RESIDENT_HOUSING_INPUT_CLS}
          >
            {RESIDENT_BATHROOM_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.id === "any"
                  ? "Any setup"
                  : opt.id === "private"
                    ? "Private bath"
                    : `Shared · ${opt.label}`}
              </option>
            ))}
          </select>
        </ResidentHousingFieldBlock>
        <ResidentHousingFieldBlock label={`Max budget · ${budgetLabel}`} className="col-span-2 lg:col-span-1">
          <input
            type="range"
            min={RESIDENT_HOUSING_BUDGET_MIN}
            max={RESIDENT_HOUSING_BUDGET_MAX}
            step={RESIDENT_HOUSING_BUDGET_STEP}
            value={budget}
            onChange={(e) => setBudget(Number(e.target.value))}
            aria-label="Maximum monthly budget"
            data-attr="resident-browse-budget"
            className="mt-3 h-2 w-full cursor-pointer accent-primary"
          />
        </ResidentHousingFieldBlock>
      </div>
      {activeCount > 0 ? (
        <button
          type="button"
          onClick={onClear}
          data-attr="resident-browse-clear-filters"
          className="text-xs font-semibold text-primary hover:underline"
        >
          Clear filters ({activeCount})
        </button>
      ) : null}
    </div>
  );
}

function BrowseFiltersInline({
  moveIn,
  setMoveIn,
  moveOut,
  setMoveOut,
  budget,
  setBudget,
  bathroom,
  setBathroom,
  roomType,
  setRoomType,
  activeCount,
  onClear,
  onApplyChatFilters,
}: {
  moveIn: string;
  setMoveIn: (v: string) => void;
  moveOut: string;
  setMoveOut: (v: string) => void;
  budget: number;
  setBudget: (v: number) => void;
  bathroom: string;
  setBathroom: (v: string) => void;
  roomType: string;
  setRoomType: (v: string) => void;
  activeCount: number;
  onClear: () => void;
  onApplyChatFilters: (filters: HousingChatAppliedFilters) => void;
}) {
  return (
    <div className="mt-4 space-y-4 border-t border-border/40 pt-4">
      <ResidentHousingChat
        onApplyFilters={onApplyChatFilters}
        title="What would you like in your next home?"
        subtitle="Tell PropLane your move-in dates, budget, neighborhood, room type, or bathroom setup — we'll filter the homes below."
        placeholder="e.g. private bath under $1,800 in Capitol Hill, moving in September"
        showMatchListings={false}
      />

      <div className="h-px w-full bg-border/50" />

      <BrowseManualFilters
        moveIn={moveIn}
        setMoveIn={setMoveIn}
        moveOut={moveOut}
        setMoveOut={setMoveOut}
        budget={budget}
        setBudget={setBudget}
        bathroom={bathroom}
        setBathroom={setBathroom}
        roomType={roomType}
        setRoomType={setRoomType}
        activeCount={activeCount}
        onClear={onClear}
      />
    </div>
  );
}

export function ResidentHousingBrowse({ propertyIds }: { propertyIds?: string[] } = {}) {
  const { listings, loading, occupancyReady } = usePublicListings();
  const scopedIds = useMemo(
    () => (propertyIds && propertyIds.length > 0 ? propertyIds : null),
    [propertyIds],
  );
  const [sort, setSort] = useState<BrowseSortId>("price-asc");
  const [moveIn, setMoveIn] = useState("");
  const [moveOut, setMoveOut] = useState("");
  const [budget, setBudget] = useState(RESIDENT_HOUSING_BUDGET_MAX);
  const [bathroom, setBathroom] = useState("any");
  const [roomType, setRoomType] = useState("any");
  const [neighborhood, setNeighborhood] = useState<string | undefined>(undefined);

  const budgetActive = budget < RESIDENT_HOUSING_BUDGET_MAX;

  const activeFilterCount = [
    moveIn.trim().length > 0,
    moveOut.trim().length > 0,
    budgetActive,
    bathroom !== "any",
    roomType !== "any",
    Boolean(neighborhood),
  ].filter(Boolean).length;

  const cards = useMemo(
    () =>
      buildPropertyBrowseCards(listings, {
        sort,
        filters: {
          maxBudgetNum: budgetActive ? budget : null,
          bathroom,
          bedroom: roomType,
          moveIn,
          moveOut,
          neighborhood,
          propertyIds: scopedIds,
        },
      }),
    [listings, sort, budgetActive, budget, bathroom, roomType, moveIn, moveOut, neighborhood, scopedIds, occupancyReady],
  );

  function applyChatFilters(applied: HousingChatAppliedFilters) {
    setMoveIn(applied.moveIn ?? "");
    setMoveOut(applied.moveOut ?? "");
    setBudget(typeof applied.maxBudget === "number" ? clampBudget(applied.maxBudget) : RESIDENT_HOUSING_BUDGET_MAX);
    setRoomType(applied.bedroom ?? "any");
    setBathroom(applied.bathroom ?? "any");
    setNeighborhood(applied.neighborhood);
  }

  function clearFilters() {
    setMoveIn("");
    setMoveOut("");
    setBudget(RESIDENT_HOUSING_BUDGET_MAX);
    setBathroom("any");
    setRoomType("any");
    setNeighborhood(undefined);
  }

  return (
    <div className="w-full">
      {scopedIds ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3">
          <p className="text-sm font-semibold text-foreground">
            Showing {cards.length} home{cards.length === 1 ? "" : "s"} shared with you
          </p>
          <a
            href="/rent/browse"
            data-attr="resident-browse-view-all"
            className="text-xs font-semibold text-primary hover:opacity-90"
          >
            View all homes →
          </a>
        </div>
      ) : null}
      <div className="mb-6 min-w-0 rounded-2xl border border-border/50 bg-background px-3 py-3 sm:px-4 sm:mb-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">
              {loading ? "Loading homes…" : `${cards.length} homes available`}
            </p>
            <p className="text-xs text-muted">Sorted by {sortLabel(sort).toLowerCase()}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="browse-sort">
              Sort homes
            </label>
            <select
              id="browse-sort"
              value={sort}
              onChange={(e) => setSort(e.target.value as BrowseSortId)}
              data-attr="resident-browse-sort"
              className="min-h-[36px] rounded-xl border border-border/60 bg-card/50 px-2.5 text-xs font-semibold text-foreground outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
            {activeFilterCount > 0 ? (
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                {activeFilterCount} filter{activeFilterCount === 1 ? "" : "s"}
              </span>
            ) : null}
          </div>
        </div>
        <div className="mt-4 space-y-4 border-t border-border/40 pt-4 lg:hidden">
          <ResidentHousingChat
            onApplyFilters={applyChatFilters}
            title="What would you like in your next home?"
            subtitle="Describe the type of home you want — room setup, budget, neighborhood, or move-in dates."
            placeholder="e.g. private bath under $1,800 in Capitol Hill, moving in September"
            showMatchListings={false}
          />
          <div className="h-px w-full bg-border/50" />
          <BrowseManualFilters
            moveIn={moveIn}
            setMoveIn={setMoveIn}
            moveOut={moveOut}
            setMoveOut={setMoveOut}
            budget={budget}
            setBudget={setBudget}
            bathroom={bathroom}
            setBathroom={setBathroom}
            roomType={roomType}
            setRoomType={setRoomType}
            activeCount={activeFilterCount}
            onClear={clearFilters}
          />
        </div>
        <div className="hidden lg:block">
          <BrowseFiltersInline
            moveIn={moveIn}
            setMoveIn={setMoveIn}
            moveOut={moveOut}
            setMoveOut={setMoveOut}
            budget={budget}
            setBudget={setBudget}
            bathroom={bathroom}
            setBathroom={setBathroom}
            roomType={roomType}
            setRoomType={setRoomType}
            activeCount={activeFilterCount}
            onClear={clearFilters}
            onApplyChatFilters={applyChatFilters}
          />
        </div>
      </div>

      {loading ? (
        <BrowseSkeleton />
      ) : cards.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/70 px-6 py-16 text-center">
          <p className="text-base font-semibold text-foreground">No homes match right now</p>
          <p className="mt-2 text-sm text-muted">
            {activeFilterCount > 0
              ? "Try adjusting your filters — new listings are added as managers publish."
              : "Check back soon — managers add listings as they go live."}
          </p>
          {activeFilterCount > 0 ? (
            <button
              type="button"
              onClick={clearFilters}
              data-attr="resident-browse-clear-filters"
              className="mt-4 text-sm font-semibold text-primary hover:underline"
            >
              Clear filters
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <div className="lg:hidden">
            <HousingBrowseSwipeStack cards={cards} />
          </div>
          <div className="hidden lg:block">
            <HousingBrowseCarousel cards={cards} />
          </div>
        </>
      )}
    </div>
  );
}
