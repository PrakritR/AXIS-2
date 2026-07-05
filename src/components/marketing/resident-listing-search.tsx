"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import { usePublicListings } from "@/hooks/use-public-listings";
import { filterRoomListings } from "@/lib/room-listings-catalog";

const BUDGET_MIN = 400;
const BUDGET_MAX = 2500;
const BUDGET_STEP = 50;
const BUDGET_MARKERS = [400, 900, 1500, 2000, 2500] as const;

const BATHROOM_OPTIONS = [
  { id: "any", label: "Any" },
  { id: "private", label: "Private bath" },
  { id: "2-share", label: "2-share" },
  { id: "3-share", label: "3-share" },
  { id: "4-share", label: "4-share" },
] as const;

const inputCls =
  "min-h-[44px] w-full rounded-xl border border-border/60 bg-[var(--glass-fill)] px-3.5 py-2.5 text-sm text-foreground outline-none transition-all duration-200 placeholder:text-muted/60 focus:border-primary/40 focus:ring-2 focus:ring-primary/25 hover:border-primary/25";

function clampBudget(n: number) {
  const stepped = Math.round(n / BUDGET_STEP) * BUDGET_STEP;
  return Math.min(BUDGET_MAX, Math.max(BUDGET_MIN, stepped));
}

export function ResidentListingSearch() {
  const { listings, loading } = usePublicListings();
  const [moveIn, setMoveIn] = useState("");
  const [moveOut, setMoveOut] = useState("");
  const [budget, setBudget] = useState(BUDGET_MAX);
  const [bathroom, setBathroom] = useState("any");

  const budgetActive = budget < BUDGET_MAX;
  const budgetLabel = budgetActive ? `$${budget.toLocaleString()}` : "Any";
  const hasActiveFilter = moveIn.trim().length > 0 || budgetActive || bathroom !== "any";
  const pct = ((clampBudget(budget) - BUDGET_MIN) / (BUDGET_MAX - BUDGET_MIN)) * 100;

  const results = useMemo(() => {
    if (!hasActiveFilter) return [];
    return filterRoomListings(listings, {
      zipRaw: "",
      radiusMiles: 50,
      maxBudgetNum: budgetActive ? budget : null,
      bathroom,
      moveIn,
      moveOut,
    });
  }, [listings, hasActiveFilter, budgetActive, budget, bathroom, moveIn, moveOut]);

  return (
    <div className="hero-search-panel relative mx-auto w-full max-w-[1060px] overflow-hidden rounded-[1.35rem] px-4 py-6 sm:rounded-[1.75rem] sm:px-8 sm:py-8">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <FieldBlock label="Move-in date">
          <input
            type="date"
            value={moveIn}
            onChange={(e) => setMoveIn(e.target.value)}
            data-attr="resident-search-move-in"
            className={inputCls}
          />
        </FieldBlock>

        <FieldBlock label="Move-out date" optional>
          <input
            type="date"
            value={moveOut}
            onChange={(e) => setMoveOut(e.target.value)}
            data-attr="resident-search-move-out"
            className={inputCls}
          />
        </FieldBlock>

        <div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Max budget / mo</span>
            <span className={`text-[13px] font-semibold ${budgetActive ? "text-primary" : "text-muted/60"}`}>
              {budgetLabel}
            </span>
          </div>
          <div className="budget-slider-wrap mt-4 px-0.5" style={{ "--budget-pct": `${pct}%` } as CSSProperties}>
            <input
              type="range"
              min={BUDGET_MIN}
              max={BUDGET_MAX}
              step={BUDGET_STEP}
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value))}
              aria-label="Maximum budget per month"
              data-attr="resident-search-budget"
              className="budget-slider relative z-10 h-7 w-full cursor-pointer appearance-none bg-transparent"
            />
            <div className="mt-1 flex justify-between gap-1 text-[11px] font-medium text-muted/50">
              {BUDGET_MARKERS.map((m) => (
                <span key={m}>{m === BUDGET_MAX ? "Any" : `$${m.toLocaleString()}`}</span>
              ))}
            </div>
          </div>
        </div>

        <FieldBlock label="Bathroom type">
          <select
            value={bathroom}
            onChange={(e) => setBathroom(e.target.value)}
            aria-label="Bathroom type"
            data-attr="resident-search-bathroom"
            className={inputCls}
          >
            {BATHROOM_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </FieldBlock>
      </div>

      <div className="my-6 h-px w-full bg-border" />

      {loading ? (
        <p className="text-center text-sm text-muted">Loading available homes…</p>
      ) : !hasActiveFilter ? (
        <p className="text-center text-sm text-muted">Enter a move-in date or budget to see matching listings.</p>
      ) : (
        <div>
          <p className="text-center text-sm font-semibold text-foreground">
            {results.length} listing{results.length === 1 ? "" : "s"} match
          </p>
          {results.length === 0 ? (
            <p className="mt-4 text-center text-[13px] text-muted">No listings match these filters.</p>
          ) : (
            <ul className="mt-4 grid gap-3 sm:grid-cols-2" aria-label="Matching listings">
              {results.map((room) => (
                <li key={room.key}>
                  <Link
                    href={`/rent/listings/${encodeURIComponent(room.propertyId)}`}
                    data-attr="resident-search-listing-card"
                    className="flex h-full flex-col gap-1.5 rounded-2xl border border-border/60 bg-card/50 p-3.5 transition hover:border-primary/25 hover:bg-card [html[data-theme=dark]_&]:border-white/10 [html[data-theme=dark]_&]:bg-white/[0.05]"
                  >
                    <p className="text-sm font-semibold leading-snug text-foreground">{room.headlineAddress}</p>
                    <p className="text-xs text-muted">{room.neighborhood}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full border border-border/60 bg-accent/30 px-2 py-0.5 text-[10px] font-semibold text-muted">
                        {room.priceLabel}
                      </span>
                      <span className="rounded-full border border-border/60 bg-accent/30 px-2 py-0.5 text-[10px] font-semibold text-muted">
                        {room.bathroomHint}
                      </span>
                      <span className="rounded-full border border-border/60 bg-accent/30 px-2 py-0.5 text-[10px] font-semibold text-muted">
                        {room.availabilityLabel}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function FieldBlock({
  label,
  optional,
  children,
}: {
  label: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{label}</span>
        {optional && <span className="text-[11px] font-normal text-muted/50">(optional)</span>}
      </div>
      {children}
    </div>
  );
}
