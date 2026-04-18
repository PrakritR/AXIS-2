"use client";

import { useMemo, useState } from "react";

const BUDGET_MIN = 600;
const BUDGET_MAX = 1100;
const BUDGET_MARKERS = [600, 850, 1100];

const BATHROOM_OPTIONS = [
  { id: "any", label: "Any" },
  { id: "private", label: "Private bath" },
  { id: "2-share", label: "2-share" },
  { id: "3-share", label: "3-share" },
  { id: "4-share", label: "4-share" },
];

export function HomeHeroSearch() {
  const [moveIn, setMoveIn] = useState("");
  const [moveOut, setMoveOut] = useState("");
  const [budget, setBudget] = useState(BUDGET_MIN);
  const [bathroom, setBathroom] = useState("any");
  const [budgetTouched, setBudgetTouched] = useState(false);

  const budgetLabel = useMemo(() => {
    if (!budgetTouched || budget >= BUDGET_MAX) return "Any";
    return `$${budget.toLocaleString()}`;
  }, [budget, budgetTouched]);

  const hasInteraction = moveIn !== "" || budgetTouched;

  const pct = ((budget - BUDGET_MIN) / (BUDGET_MAX - BUDGET_MIN)) * 100;

  return (
    <div className="mx-auto w-full max-w-[1060px] rounded-3xl bg-white px-7 py-8 shadow-[0_8px_48px_-8px_rgba(13,31,78,0.13)] ring-1 ring-slate-200/60 sm:px-10 sm:py-10">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">

        {/* Move-in date */}
        <FieldBlock label="Move-in date">
          <div className="relative mt-2.5">
            <input
              type="date"
              value={moveIn}
              onChange={(e) => setMoveIn(e.target.value)}
              className="[color-scheme:light] w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-3.5 pr-3 text-sm text-slate-800 outline-none transition-all duration-150 focus:border-[#2b5ce7] focus:bg-white focus:ring-3 focus:ring-[#2b5ce7]/15 hover:border-slate-300"
            />
          </div>
        </FieldBlock>

        {/* Move-out date */}
        <FieldBlock label="Move-out date" optional>
          <div className="relative mt-2.5">
            <input
              type="date"
              value={moveOut}
              onChange={(e) => setMoveOut(e.target.value)}
              className="[color-scheme:light] w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-3.5 pr-3 text-sm text-slate-800 outline-none transition-all duration-150 focus:border-[#2b5ce7] focus:bg-white focus:ring-3 focus:ring-[#2b5ce7]/15 hover:border-slate-300"
            />
          </div>
        </FieldBlock>

        {/* Budget slider */}
        <div>
          <div className="flex items-center justify-between gap-2">
            <label className="text-[11px] font-semibold uppercase tracking-[0.13em] text-slate-500">
              Max budget / month
            </label>
            <span
              className={`text-sm font-semibold transition-colors duration-150 ${
                budgetTouched && budget < BUDGET_MAX ? "text-[#2b5ce7]" : "text-slate-400"
              }`}
            >
              {budgetLabel}
            </span>
          </div>
          <div className="mt-3.5 px-0.5">
            <div className="relative">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-[#2b5ce7] transition-all duration-75"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <input
                type="range"
                min={BUDGET_MIN}
                max={BUDGET_MAX}
                step={10}
                value={budget}
                onChange={(e) => {
                  setBudget(Number(e.target.value));
                  setBudgetTouched(true);
                }}
                className="absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[#2b5ce7] [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_1px_4px_rgba(43,92,231,0.35)] [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:duration-100 [&::-webkit-slider-thumb]:hover:scale-110 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-[#2b5ce7] [&::-moz-range-thumb]:bg-white"
              />
            </div>
            <div className="mt-2 flex justify-between text-[11px] font-medium text-slate-400">
              {BUDGET_MARKERS.map((m) => (
                <span key={m}>{m === BUDGET_MAX ? "Any" : `$${m.toLocaleString()}`}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Bathroom type */}
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-[0.13em] text-slate-500">
            Bathroom type
          </label>
          <div className="relative mt-2.5">
            <select
              value={bathroom}
              onChange={(e) => setBathroom(e.target.value)}
              className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 py-3 pl-3.5 pr-8 text-sm text-slate-800 outline-none transition-all duration-150 focus:border-[#2b5ce7] focus:bg-white focus:ring-3 focus:ring-[#2b5ce7]/15 hover:border-slate-300"
            >
              {BATHROOM_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden>
              <ChevronIcon />
            </span>
          </div>
        </div>
      </div>

      <div className="my-7 border-t border-slate-100" />

      {hasInteraction ? (
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="text-sm font-medium text-slate-500">
            Showing listings matching your filters
          </p>
          <a
            href="/rent/listings"
            className="inline-flex items-center gap-2 rounded-full bg-[#2b5ce7] px-8 py-2.5 text-sm font-semibold text-white shadow-[0_0_20px_rgba(43,92,231,0.35)] transition-all duration-200 hover:bg-[#2451d4] hover:shadow-[0_0_28px_rgba(43,92,231,0.45)] active:scale-[0.98]"
          >
            <SearchIcon />
            View listings
          </a>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="text-slate-300" aria-hidden>
            <SearchIcon size={28} />
          </span>
          <p className="text-sm text-slate-400">
            Enter a move-in date or adjust budget to see matching listings
          </p>
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
      <label className="text-[11px] font-semibold uppercase tracking-[0.13em] text-slate-500">
        {label}
        {optional && (
          <span className="ml-1.5 font-normal normal-case tracking-normal text-slate-400">
            (optional)
          </span>
        )}
      </label>
      {children}
    </div>
  );
}

function ChevronIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SearchIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
