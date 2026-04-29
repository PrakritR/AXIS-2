"use client";

import { mockProperties } from "@/data/mock-properties";
import type { MockProperty } from "@/data/types";
import { loadPublicExtraListingsFromServer, PROPERTY_PIPELINE_EVENT, readExtraListings } from "@/lib/demo-property-pipeline";
import { RADIUS_MILE_OPTIONS, parseRadiusParam } from "@/lib/listings-search";
import { RoomListingCard } from "@/components/marketing/room-listing-card";
import { filterRoomListings } from "@/lib/room-listings-catalog";
import Link from "next/link";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";

/** Slider min/max (max = “no cap” / Any in UI). Step keeps URLs tidy. */
const BUDGET_MIN = 500;
const BUDGET_MAX = 5000;
const BUDGET_STEP = 50;
const BUDGET_MARKERS = [500, 1500, 3000, 5000] as const;

const BATHROOM_OPTIONS = [
  { id: "any", label: "Any" },
  { id: "private", label: "Private bath" },
  { id: "2-share", label: "2-share" },
  { id: "3-share", label: "3-share" },
  { id: "4-share", label: "4-share" },
];

const inputCls =
  "[color-scheme:light] min-h-[44px] w-full rounded-xl border-0 bg-black/[0.04] px-3.5 py-2.5 text-[16px] text-[#1d1d1f] outline-none transition-all duration-200 placeholder:text-[#6e6e73]/60 focus:bg-white focus:ring-2 focus:ring-[#007aff]/25 hover:bg-black/[0.06] sm:py-3 sm:text-[14px]";

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

  const budgetFromUrl =
    initialMaxBudget != null && Number.isFinite(initialMaxBudget) && initialMaxBudget < BUDGET_MAX;

  const [moveIn, setMoveIn] = useState(initialMoveIn);
  const [moveOut, setMoveOut] = useState(initialMoveOut);
  const [budget, setBudget] = useState(() =>
    budgetFromUrl ? clampBudget(initialMaxBudget as number) : BUDGET_MIN,
  );
  const [bathroom, setBathroom] = useState(initialBathroom || "any");
  const [budgetTouched, setBudgetTouched] = useState(budgetFromUrl);
  const [zip, setZip] = useState(() => initialZip.replace(/\D/g, "").slice(0, 5));
  const [radius, setRadius] = useState<number>(safeRadius);
  const [extras, setExtras] = useState<MockProperty[]>([]);

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

  const combinedProperties = useMemo(() => [...mockProperties, ...extras], [extras]);

  const budgetLabel = useMemo(() => {
    if (!budgetTouched || budget >= BUDGET_MAX) return "Any";
    return `$${budget.toLocaleString()}`;
  }, [budget, budgetTouched]);

  const zipDigits = zip.replace(/\D/g, "").slice(0, 5);
  const zipValid = zipDigits.length === 5;
  const hasInteraction = zipValid || moveIn !== "" || budgetTouched;
  const pct = ((budget - BUDGET_MIN) / (BUDGET_MAX - BUDGET_MIN)) * 100;

  const filteredRooms = useMemo(
    () =>
      filterRoomListings(combinedProperties, {
        zipRaw: zipDigits,
        radiusMiles: radius,
        maxBudgetNum: budgetTouched && budget < BUDGET_MAX ? budget : null,
        bathroom,
        moveIn,
        moveOut,
      }),
    [combinedProperties, zipDigits, radius, budget, budgetTouched, bathroom, moveIn, moveOut],
  );

  const listingsHref = useMemo(() => {
    const q = new URLSearchParams();
    if (zipValid) q.set("zip", zipDigits);
    q.set("radius", String(radius));
    if (moveIn) q.set("moveIn", moveIn);
    if (moveOut) q.set("moveOut", moveOut);
    if (budgetTouched && budget < BUDGET_MAX) q.set("maxBudget", String(budget));
    q.set("bathroom", bathroom);
    return `/rent/listings?${q.toString()}`;
  }, [zipValid, zipDigits, radius, moveIn, moveOut, budget, budgetTouched, bathroom]);

  return (
    <div
      className="mx-auto w-full max-w-[1060px] rounded-2xl px-4 py-6 sm:px-10 sm:py-9"
      style={{
        background: "rgba(255,255,255,0.75)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        border: "1px solid rgba(0,0,0,0.06)",
        boxShadow: "0 8px 40px rgba(0,0,0,0.07), 0 1px 0 rgba(255,255,255,0.9) inset",
      }}
    >
      {/* Row 1: main filters */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <FieldBlock label="Move-in date">
          <input type="date" value={moveIn} onChange={(e) => setMoveIn(e.target.value)} className={inputCls} />
        </FieldBlock>

        <FieldBlock label="Move-out date" optional>
          <input type="date" value={moveOut} onChange={(e) => setMoveOut(e.target.value)} className={inputCls} />
        </FieldBlock>

        {/* Budget slider */}
        <div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6e6e73]">Max budget / mo</span>
            <span className={`text-[13px] font-semibold transition-colors duration-200 ${budgetTouched && budget < BUDGET_MAX ? "text-[#007aff]" : "text-[#6e6e73]/60"}`}>
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
              onChange={(e) => {
                setBudget(Number(e.target.value));
                setBudgetTouched(true);
              }}
              className="budget-slider relative z-10 h-7 w-full cursor-pointer appearance-none bg-transparent"
            />
            <div className="mt-1 flex justify-between gap-1 text-[11px] font-medium text-[#6e6e73]/50">
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
      <div className="mt-5 grid grid-cols-1 gap-5 border-t border-black/[0.05] pt-5 sm:grid-cols-2">
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

      <div className="my-6 h-px w-full bg-black/[0.05]" />

      {hasInteraction ? (
        <div className="flex w-full flex-col items-center gap-3 text-center">
          <p className="text-[13px] text-[#6e6e73]">
            {zipValid
              ? <>Listings within <strong className="font-semibold text-[#1d1d1f]">{radius} mi</strong> of <strong className="font-semibold text-[#1d1d1f]">{zipDigits}</strong>{moveIn || budgetTouched ? " · plus your filters" : ""}</>
              : "Showing listings matching your filters"
            }
          </p>
          <a
            href={listingsHref}
            className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full px-8 py-3 text-[15px] font-semibold text-white transition-all duration-200 hover:-translate-y-[1px] active:scale-[0.98] sm:min-h-0 sm:py-2.5 sm:text-[14px]"
            style={{ background: "linear-gradient(135deg, #007aff, #339cff)", boxShadow: "0 4px 20px rgba(0,122,255,0.35)" }}
          >
            <SearchIcon /> {variant === "listings" ? "Apply search" : "View listings"}
          </a>
          <Link
            href="/rent/listings"
            className="text-[13px] font-semibold text-[#007aff] underline-offset-4 hover:underline"
          >
            View all rooms
          </Link>

          <div className="mt-6 w-full border-t border-black/[0.06] pt-6 text-left">
            <p className="text-center text-sm font-semibold text-[#1d1d1f]">
              {filteredRooms.length} room{filteredRooms.length === 1 ? "" : "s"} match
            </p>
            {filteredRooms.length === 0 ? (
              <p className="mt-4 text-center text-[13px] text-[#6e6e73]">No rooms match these filters.</p>
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
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="text-[#6e6e73]/25" aria-hidden><SearchIcon size={26} /></span>
          <p className="text-[13px] text-[#6e6e73]/60">
            Enter a ZIP, move-in date, or adjust budget to search listings
          </p>
          <Link
            href="/rent/listings"
            className="inline-flex min-h-[48px] w-full max-w-xs items-center justify-center rounded-full border border-[#007aff]/35 bg-[#007aff]/[0.06] px-6 py-3 text-[14px] font-semibold text-[#007aff] transition hover:bg-[#007aff]/[0.1] sm:min-h-0 sm:w-auto sm:py-2 sm:text-[13px]"
          >
            View all rooms
          </Link>
        </div>
      )}
    </div>
  );
}

function FieldBlock({ label, optional, hint, children }: { label: string; optional?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-baseline gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6e6e73]">{label}</span>
        {optional && <span className="text-[11px] font-normal text-[#6e6e73]/50">(optional)</span>}
      </div>
      {hint && <p className="mb-1.5 text-[11px] text-[#6e6e73]/50">{hint}</p>}
      {children}
    </div>
  );
}

function ChevronIcon() {
  return (
    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#6e6e73]/60" aria-hidden>
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
