"use client";

import { useMemo, useState } from "react";

const BUDGET_MARKERS = [500, 850, 1100];

export function HomeHeroSearch() {
  const [budget, setBudget] = useState(1100);

  const budgetLabel = useMemo(() => {
    if (budget >= 1100) return "Any";
    return `$${budget}`;
  }, [budget]);

  return (
    <div className="mx-auto w-full max-w-4xl rounded-[28px] border border-slate-200/80 bg-white px-6 py-8 shadow-[0_24px_80px_-24px_rgba(15,23,42,0.18)] sm:px-10 sm:py-10">
      <div className="grid gap-6 lg:grid-cols-2 lg:gap-x-10 lg:gap-y-6">
        <div>
          <label className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
            Move-in date
          </label>
          <div className="relative mt-2">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden>
              <CalendarIcon />
            </span>
            <input
              type="text"
              placeholder="mm/dd/yyyy"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50/80 py-2.5 pl-10 pr-3 text-sm text-slate-900 outline-none ring-0 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:shadow-[0_0_0_3px_rgba(59,130,246,0.15)]"
            />
          </div>
        </div>
        <div>
          <label className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
            Move-out date (optional)
          </label>
          <div className="relative mt-2">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden>
              <CalendarIcon />
            </span>
            <input
              type="text"
              placeholder="mm/dd/yyyy"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50/80 py-2.5 pl-10 pr-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:shadow-[0_0_0_3px_rgba(59,130,246,0.15)]"
            />
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="flex items-center justify-between gap-4">
            <label className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
              Max budget / month
            </label>
            <span className="text-sm font-semibold text-slate-900">{budgetLabel}</span>
          </div>
          <div className="mt-4 px-1">
            <input
              type="range"
              min={500}
              max={1100}
              step={10}
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value))}
              className="home-budget-slider h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-blue-600"
            />
            <div className="mt-2 flex justify-between text-xs font-semibold text-slate-500">
              {BUDGET_MARKERS.map((m) => (
                <span key={m}>${m.toLocaleString()}</span>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          <label className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
            Bathroom type
          </label>
          <div className="relative mt-2">
            <select className="w-full appearance-none rounded-2xl border border-slate-200 bg-slate-50/80 py-2.5 pl-3 pr-10 text-sm font-medium text-slate-900 outline-none focus:border-blue-500 focus:bg-white focus:shadow-[0_0_0_3px_rgba(59,130,246,0.15)]">
              <option>Any</option>
              <option>Private</option>
              <option>Shared</option>
            </select>
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">▾</span>
          </div>
        </div>
      </div>

      <div className="mt-10 flex flex-col items-center text-center">
        <span className="text-slate-400" aria-hidden>
          <SearchIcon />
        </span>
        <p className="mt-3 max-w-md text-sm text-slate-500">
          Enter a move-in date or budget to see matching listings
        </p>
      </div>
    </div>
  );
}

function CalendarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-slate-400">
      <path
        d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="mx-auto text-slate-400">
      <path
        d="M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
