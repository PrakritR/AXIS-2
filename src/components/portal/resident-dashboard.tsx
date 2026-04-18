"use client";

import Link from "next/link";

export function ResidentDashboard() {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-amber-200/80 bg-amber-50/90 px-5 py-4">
        <p className="text-sm font-semibold text-amber-900">Application under review</p>
        <p className="mt-1 text-sm text-amber-800">
          A property manager still needs to approve your application before work orders, payments,
          leasing, and inbox are available.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* LEASE */}
        <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-4 shadow-[0_8px_32px_-16px_rgba(0,122,255,0.14)]">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Lease</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-slate-400">—</p>
          <p className="mt-3 text-xs text-slate-500">Available after your application is approved</p>
          <button
            type="button"
            disabled
            className="mt-3 cursor-not-allowed rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-semibold text-slate-400"
          >
            View lease
          </button>
        </div>

        {/* TOTAL PAYMENT DUE */}
        <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-4 shadow-[0_8px_32px_-16px_rgba(0,122,255,0.14)]">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
            Total payment due
          </p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-slate-400">—</p>
        </div>

        {/* WORK ORDERS */}
        <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-4 shadow-[0_8px_32px_-16px_rgba(0,122,255,0.14)]">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
            Work orders
          </p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-slate-400">—</p>
        </div>

        {/* YOUR HOME */}
        <div className="rounded-2xl border border-primary/20 bg-primary/[0.06] px-4 py-4 shadow-[0_8px_32px_-16px_rgba(0,122,255,0.18)]">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
            Your home
          </p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-primary">—</p>
        </div>
      </div>

      <Link
        href="/resident/inbox/unopened"
        className="flex items-center justify-between rounded-2xl border border-primary/15 bg-white px-5 py-4 shadow-[0_8px_32px_-16px_rgba(0,122,255,0.14)] transition hover:border-primary/35"
      >
        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Inbox</span>
        <span className="text-sm font-semibold text-primary">Open messages →</span>
      </Link>
    </div>
  );
}
