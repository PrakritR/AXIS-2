"use client";

import { useMemo, useState } from "react";

const BUDGET_MARKERS = [600, 850, 1100];

const BATHROOM_OPTIONS = [
  { id: "any", label: "Any" },
  { id: "private", label: "Private bath" },
  { id: "2-share", label: "2-share" },
  { id: "3-share", label: "3-share" },
  { id: "4-share", label: "4-share" },
];

export function HomeHeroSearch() {
  const [budget, setBudget] = useState(600);

  const budgetLabel = useMemo(() => {
    if (budget >= 1100) return "Any";
    return `$${budget.toLocaleString()}`;
  }, [budget]);

  return (
    <div className="mx-auto w-full max-w-[1060px] rounded-3xl bg-white px-7 py-8 shadow-[0_8px_40px_-8px_rgba(13,31,78,0.12)] sm:px-10 sm:py-10">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {/* Move-in date */}
        <FieldBlock label="Move-in date">
          <div className="relative mt-2.5">
            <input
              type="date"
              className="[color-scheme:light] w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-3.5 pr-3 text-sm text-slate-800 outline-none focus:border-[#2b5ce7] focus:bg-white focus:ring-3 focus:ring-[#2b5ce7]/15"
            />
          </div>
        </FieldBlock>

        {/* Move-out date */}
        <FieldBlock label="Move-out date" optional>
          <div className="relative mt-2.5">
            <input
              type="date"
              className="[color-scheme:light] w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-3.5 pr-3 text-sm text-slate-800 outline-none focus:border-[#2b5ce7] focus:bg-white focus:ring-3 focus:ring-[#2b5ce7]/15"
            />
          </div>
        </FieldBlock>

        {/* Budget slider */}
        <div>
          <div className="flex items-center justify-between gap-2">
            <label className="text-[11px] font-semibold uppercase tracking-[0.13em] text-slate-500">
              Max budget / month
            </label>
            <span className="text-sm font-semibold text-slate-700">{budgetLabel}</span>
          </div>
          <div className="mt-3.5 px-0.5">
            <input
              type="range"
              min={600}
              max={1100}
              step={10}
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value))}
              className="home-budget-slider h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-200"
            />
            <div className="mt-2 flex justify-between text-[11px] font-medium text-slate-400">
              {BUDGET_MARKERS.map((m) => (
                <span key={m}>${m.toLocaleString()}</span>
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
            <select className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 py-3 pl-3.5 pr-8 text-sm text-slate-800 outline-none focus:border-[#2b5ce7] focus:bg-white focus:ring-3 focus:ring-[#2b5ce7]/15">
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

      <div className="my-8 border-t border-slate-100" />

      <div className="flex flex-col items-center gap-3 text-center">
        <span className="text-slate-300" aria-hidden>
          <SearchIcon />
        </span>
        <p className="text-sm text-slate-400">
          Enter a move-in date or budget to see matching listings
        </p>
      </div>
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
          <span className="ml-1.5 normal-case text-slate-400 font-normal tracking-normal lowercase">
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
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
      <path
        d="M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
