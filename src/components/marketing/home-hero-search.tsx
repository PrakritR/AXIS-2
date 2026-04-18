"use client";

import { useMemo, useState } from "react";
import { BathroomSelect } from "@/components/marketing/bathroom-select";

const BUDGET_MARKERS = [600, 850, 1100];

export function HomeHeroSearch() {
  const [budget, setBudget] = useState(1100);

  const budgetLabel = useMemo(() => {
    if (budget >= 1100) return "Any";
    return `$${budget}`;
  }, [budget]);

  return (
    <div className="mx-auto w-full max-w-[1100px] rounded-[28px] border border-slate-200/90 bg-white px-5 py-8 shadow-[0_24px_80px_-24px_rgba(15,23,42,0.16)] sm:px-7 sm:py-9">
      <div className="flex min-w-0 flex-wrap items-end gap-x-5 gap-y-6 lg:flex-nowrap lg:gap-x-6">
        <FieldBlock label="Move-in date" className="min-w-[140px] flex-1">
          <div className="relative mt-2">
            <input
              type="text"
              placeholder="mm/dd/yyyy"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50/90 py-2.5 pl-3 pr-10 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-[#2b5ce7] focus:bg-white focus:shadow-[0_0_0_3px_rgba(43,92,231,0.18)]"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden>
              <CalendarIcon />
            </span>
          </div>
        </FieldBlock>

        <FieldBlock label="Move-out date (optional)" className="min-w-[140px] flex-1">
          <div className="relative mt-2">
            <input
              type="text"
              placeholder="mm/dd/yyyy"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50/90 py-2.5 pl-3 pr-10 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-[#2b5ce7] focus:bg-white focus:shadow-[0_0_0_3px_rgba(43,92,231,0.18)]"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden>
              <CalendarIcon />
            </span>
          </div>
        </FieldBlock>

        <div className="min-w-[200px] flex-[1.25]">
          <div className="flex items-end justify-between gap-2">
            <label className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
              Max budget / month
            </label>
            <span className="pb-0.5 text-sm font-semibold text-slate-700">{budgetLabel}</span>
          </div>
          <div className="mt-2 px-0.5">
            <input
              type="range"
              min={600}
              max={1100}
              step={10}
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value))}
              className="home-budget-slider h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200"
            />
            <div className="mt-1.5 flex justify-between text-[11px] font-semibold text-slate-500">
              {BUDGET_MARKERS.map((m) => (
                <span key={m}>${m.toLocaleString()}</span>
              ))}
            </div>
          </div>
        </div>

        <div className="min-w-[150px] flex-1">
          <BathroomSelect />
        </div>

        <FieldBlock label="Zipcode" className="min-w-[110px] flex-1">
          <input
            type="text"
            inputMode="numeric"
            placeholder="98105"
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50/90 px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-[#2b5ce7] focus:bg-white focus:shadow-[0_0_0_3px_rgba(43,92,231,0.18)]"
          />
        </FieldBlock>

        <div className="min-w-[130px] flex-1">
          <label className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Radius</label>
          <p className="mt-0.5 text-[10px] font-medium leading-snug text-slate-400">
            You’d be fine living within
          </p>
          <select className="mt-1.5 w-full appearance-none rounded-2xl border border-slate-200 bg-slate-50/90 px-3 py-2.5 text-sm font-medium text-slate-900 outline-none focus:border-[#2b5ce7] focus:bg-white focus:shadow-[0_0_0_3px_rgba(43,92,231,0.18)]">
            <option>5 miles</option>
            <option>10 miles</option>
            <option>25 miles</option>
            <option>Any distance</option>
          </select>
        </div>
      </div>

      <div className="my-8 border-t border-slate-200/90" />

      <div className="flex flex-col items-center text-center">
        <span className="text-slate-300" aria-hidden>
          <SearchIcon />
        </span>
        <p className="mt-3 max-w-md text-sm text-slate-500">
          Enter a move-in date or budget to see matching listings
        </p>
      </div>
    </div>
  );
}

function FieldBlock({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</label>
      {children}
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
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="mx-auto">
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
