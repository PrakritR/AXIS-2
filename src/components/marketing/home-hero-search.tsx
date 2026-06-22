"use client";

import { mockProperties } from "@/data/mock-properties";
import type { MockProperty } from "@/data/types";
import { loadPublicExtraListingsFromServer, PROPERTY_PIPELINE_EVENT, readExtraListings } from "@/lib/demo-property-pipeline";
import { MANAGER_APPLICATIONS_EVENT, syncPublicApprovedApplicationsFromServer } from "@/lib/manager-applications-storage";
import { RADIUS_MILE_OPTIONS, parseRadiusParam } from "@/lib/listings-search";
import { PropertyCard } from "@/components/marketing/property-card";
import { RoomListingCard } from "@/components/marketing/room-listing-card";
import { filterRoomListings } from "@/lib/room-listings-catalog";
import Link from "next/link";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";

/** Slider min/max (max = “no cap” / Any in UI). Step keeps URLs tidy. */
const BUDGET_MIN = 200;
const BUDGET_MAX = 5000;
const BUDGET_STEP = 50;
const BUDGET_MARKERS = [200, 750, 1500, 3000, 5000] as const;

const BATHROOM_OPTIONS = [
  { id: "any", label: "Any" },
  { id: "private", label: "Private bath" },
  { id: "2-share", label: "2-share" },
  { id: "3-share", label: "3-share" },
  { id: "4-share", label: "4-share" },
];

export const LISTINGS_PENDING_SEARCH_KEY = "axis:listings-pending-search:v1";

const inputCls =
  "min-h-[44px] w-full rounded-xl border border-border/60 bg-auth-input-bg px-3.5 py-2.5 text-[16px] text-foreground outline-none transition-all duration-200 placeholder:text-muted/60 focus:border-primary/40 focus:ring-2 focus:ring-primary/25 hover:border-primary/25 sm:py-3 sm:text-[14px]";

export type HomeHeroSearchProps = {
  variant?: "hero" | "listings";
  /** Hydrate from `/rent/listings` query string */
  initialZip?: string;
  initialRadius?: number;
  initialMoveIn?: string;
  initialMoveOut?: string;
  /** When set and below max slider value, budget cap is active */
  initialMaxBudget?: number | null;
  initialBathroom?: string;
};

type PendingListingsSearch = {
  zipRaw: string;
  radiusMiles: number;
  moveIn: string;
  moveOut: string;
  maxBudgetNum: number | null;
  bathroom: string;
};

function clampBudget(n: number) {
  const stepped = Math.round(n / BUDGET_STEP) * BUDGET_STEP;
  return Math.min(BUDGET_MAX, Math.max(BUDGET_MIN, stepped));
}

export function HomeHeroSearch(props: HomeHeroSearchProps = {}) {
  const {
    variant = "hero",
    initialZip = "",
    initialRadius = 10,
    initialMoveIn = "",
    initialMoveOut = "",
    initialMaxBudget = null,
    initialBathroom = "any",
  } = props;

  const safeRadius = parseRadiusParam(String(initialRadius));

  const [moveIn, setMoveIn] = useState(initialMoveIn);
  const [moveOut, setMoveOut] = useState(initialMoveOut);
  const [budget, setBudget] = useState(() =>
    initialMaxBudget != null && Number.isFinite(initialMaxBudget) && initialMaxBudget < BUDGET_MAX
      ? clampBudget(initialMaxBudget)
      : BUDGET_MAX,
  );
  const [bathroom, setBathroom] = useState(initialBathroom || "any");
  const [zip, setZip] = useState(() => initialZip.replace(/\D/g, "").slice(0, 5));
  const [radius, setRadius] = useState<number>(safeRadius);
  const [extras, setExtras] = useState<MockProperty[]>([]);
  const [applicationTick, setApplicationTick] = useState(0);

  useEffect(() => {
    const sync = () => {
      setExtras(readExtraListings());
      void loadPublicExtraListingsFromServer().then(setExtras);
    };
    sync();
    const on = () => sync();
    window.addEventListener(PROPERTY_PIPELINE_EVENT, on);
    return () => window.removeEventListener(PROPERTY_PIPELINE_EVENT, on);
  }, []);

  useEffect(() => {
    const sync = () => {
      void syncPublicApprovedApplicationsFromServer({ force: true }).then(() => setApplicationTick((n) => n + 1));
    };
    sync();
    window.addEventListener(MANAGER_APPLICATIONS_EVENT, sync);
    return () => window.removeEventListener(MANAGER_APPLICATIONS_EVENT, sync);
  }, []);

  const combinedProperties = useMemo(() => [...mockProperties, ...extras], [extras]);

  const budgetLabel = useMemo(() => {
    if (budget >= BUDGET_MAX) return "Any";
    return `$${budget.toLocaleString()}`;
  }, [budget]);

  const zipDigits = zip.replace(/\D/g, "").slice(0, 5);
  const zipValid = zipDigits.length === 5;
  const moveInSelected = moveIn.trim().length > 0;
  const budgetSelected = budget < BUDGET_MAX;
  const hasActiveFilter = moveInSelected || budgetSelected || bathroom !== "any" || zipValid;
  const roomSearchReady = hasActiveFilter;
  const pct = ((budget - BUDGET_MIN) / (BUDGET_MAX - BUDGET_MIN)) * 100;

  const filteredRooms = useMemo(
    () => {
      void applicationTick;
      return (
      filterRoomListings(combinedProperties, {
        zipRaw: zipDigits,
        radiusMiles: radius,
        maxBudgetNum: budget < BUDGET_MAX ? budget : null,
        bathroom,
        moveIn,
        moveOut,
      })
      );
    },
    [combinedProperties, zipDigits, radius, budget, bathroom, moveIn, moveOut, applicationTick],
  );

  const pendingSearch = useMemo<PendingListingsSearch | null>(() => {
    if (!roomSearchReady) return null;
    return {
      zipRaw: zipValid ? zipDigits : "",
      radiusMiles: radius,
      moveIn,
      moveOut,
      maxBudgetNum: budget,
      bathroom,
    };
  }, [roomSearchReady, zipValid, zipDigits, radius, moveIn, moveOut, budget, bathroom]);

  const listingsHref = "/rent/listings";

  function storePendingListingsSearch() {
    if (typeof window === "undefined") return;
    try {
      if (pendingSearch) {
        window.sessionStorage.setItem(LISTINGS_PENDING_SEARCH_KEY, JSON.stringify(pendingSearch));
      } else {
        window.sessionStorage.removeItem(LISTINGS_PENDING_SEARCH_KEY);
      }
    } catch {
      /* ignore session storage failures */
    }
  }

  return (
    <div className="hero-search-panel relative mx-auto w-full max-w-[1060px] overflow-hidden rounded-[1.35rem] px-4 py-6 sm:rounded-[1.75rem] sm:px-10 sm:py-9">
      <div
        className="sheen-sweep pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 bg-gradient-to-r from-transparent via-white/25 to-transparent"
        aria-hidden
      />
      {/* Row 1: main filters */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <FieldBlock label="Move-in date" required>
          <input type="date" value={moveIn} onChange={(e) => setMoveIn(e.target.value)} className={inputCls} />
        </FieldBlock>

        <FieldBlock label="Move-out date" optional>
          <input type="date" value={moveOut} onChange={(e) => setMoveOut(e.target.value)} className={inputCls} />
        </FieldBlock>

        {/* Budget slider */}
        <div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Max budget / mo</span>
            <span className={`text-[13px] font-semibold transition-colors duration-200 ${budget < BUDGET_MAX ? "text-primary" : "text-muted/60"}`}>
              {budgetLabel}
            </span>
          </div>
          <div
            className="budget-slider-wrap mt-4 px-0.5"
            style={{ "--budget-pct": `${pct}%` } as CSSProperties}
          >
            <input
              type="range"
              min={BUDGET_MIN}
              max={BUDGET_MAX}
              step={BUDGET_STEP}
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value))}
              className="budget-slider relative z-10 h-7 w-full cursor-pointer appearance-none bg-transparent"
            />
            <div className="mt-1 flex justify-between gap-1 text-[11px] font-medium text-muted/50">
              {BUDGET_MARKERS.map((m) => (
                <span key={m} className={m === BUDGET_MAX ? "text-right" : ""}>
                  {m === BUDGET_MAX ? "Any" : `$${m.toLocaleString()}`}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Bathroom */}
        <FieldBlock label="Bathroom type">
          <div className="relative">
            <select value={bathroom} onChange={(e) => setBathroom(e.target.value)} className={`${inputCls} appearance-none pr-8`}>
              {BATHROOM_OPTIONS.map((opt) => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
            </select>
            <ChevronIcon />
          </div>
        </FieldBlock>
      </div>

      {/* Row 2: ZIP + radius */}
      <div className="mt-5 grid grid-cols-1 gap-5 border-t border-border pt-5 sm:grid-cols-2">
        <FieldBlock label="ZIP code" hint="5-digit US ZIP code">
          <div>
            <input
              type="text" inputMode="numeric" autoComplete="postal-code" maxLength={5}
              placeholder="98105" value={zipDigits}
              onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))}
              className={inputCls}
            />
            {zip.length > 0 && !zipValid && (
              <p className="mt-1.5 text-[11px] text-amber-600">Enter all 5 digits to search by area.</p>
            )}
          </div>
        </FieldBlock>

        <FieldBlock label="Radius" hint="Search distance from ZIP">
          <div className="relative">
            <select value={radius} onChange={(e) => setRadius(Number(e.target.value))} className={`${inputCls} appearance-none pr-8`}>
              {RADIUS_MILE_OPTIONS.map((m) => <option key={m} value={m}>{m} miles</option>)}
            </select>
            <ChevronIcon />
          </div>
        </FieldBlock>
      </div>

      <div className="my-6 h-px w-full bg-border" />

      {roomSearchReady ? (
        <div className="flex w-full flex-col items-center gap-3 text-center">
          <p className="text-[13px] text-muted">
            {zipValid
              ? <>Rooms within <strong className="font-semibold text-foreground">{radius} mi</strong> of <strong className="font-semibold text-foreground">{zipDigits}</strong></>
              : "Rooms matching your filters"
            }
          </p>
          <a
            href={listingsHref}
            onClick={storePendingListingsSearch}
            className="btn-cobalt inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full px-8 py-3 text-[15px] font-semibold transition-all duration-200 hover:-translate-y-[1px] active:scale-[0.98] sm:min-h-0 sm:py-2.5 sm:text-[14px]"
          >
            <SearchIcon /> {variant === "listings" ? "Apply search" : "View listings"}
          </a>
          <Link
            href="/rent/listings"
            onClick={() => {
              if (typeof window === "undefined") return;
              try {
                window.sessionStorage.removeItem(LISTINGS_PENDING_SEARCH_KEY);
              } catch {
                /* ignore */
              }
            }}
            className="text-[13px] font-semibold text-primary underline-offset-4 hover:underline"
          >
            View all houses
          </Link>

          <div className="mt-6 w-full border-t border-border pt-6 text-left">
            <p className="text-center text-sm font-semibold text-foreground">
              {filteredRooms.length} room{filteredRooms.length === 1 ? "" : "s"} match
            </p>
            {filteredRooms.length === 0 ? (
              <p className="mt-4 text-center text-[13px] text-muted">No rooms match these filters.</p>
            ) : (
              <div className="mt-4 grid w-full gap-4 sm:grid-cols-2">
                {filteredRooms.map((room) => (
                  <RoomListingCard key={room.key} row={room} />
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="w-full">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">
              {combinedProperties.length} house{combinedProperties.length === 1 ? "" : "s"} available
            </p>
            <Link
              href="/rent/listings"
              onClick={() => {
                if (typeof window === "undefined") return;
                try {
                  window.sessionStorage.removeItem(LISTINGS_PENDING_SEARCH_KEY);
                } catch {
                  /* ignore */
                }
              }}
              className="text-[13px] font-semibold text-primary hover:underline underline-offset-2"
            >
              View all →
            </Link>
          </div>
          {combinedProperties.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-muted">No listings available yet.</p>
          ) : (
            <div className="grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {combinedProperties.slice(0, 6).map((property) => (
                <PropertyCard key={property.id} property={property} />
              ))}
            </div>
          )}
          {combinedProperties.length > 6 && (
            <div className="mt-5 text-center">
              <Link
                href="/rent/listings"
                onClick={() => {
                  if (typeof window === "undefined") return;
                  try {
                    window.sessionStorage.removeItem(LISTINGS_PENDING_SEARCH_KEY);
                  } catch {
                    /* ignore */
                  }
                }}
                className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary hover:underline underline-offset-2"
              >
                See all {combinedProperties.length} houses →
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FieldBlock({ label, optional, required: isRequired, hint, children }: { label: string; optional?: boolean; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-baseline gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{label}</span>
        {isRequired && <span className="text-[11px] font-medium text-primary">(required)</span>}
        {optional && <span className="text-[11px] font-normal text-muted/50">(optional)</span>}
      </div>
      {hint && <p className="mb-1.5 text-[11px] text-muted/50">{hint}</p>}
      {children}
    </div>
  );
}

function ChevronIcon() {
  return (
    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted/60" aria-hidden>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
        <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function SearchIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
