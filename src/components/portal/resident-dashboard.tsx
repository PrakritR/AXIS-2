"use client";

import Link from "next/link";
import type { ReactNode } from "react";

function StatCard({
  label,
  children,
  muted,
}: {
  label: string;
  children: ReactNode;
  muted?: boolean;
}) {
  return (
    <div
      className={`flex min-h-[7.5rem] flex-col rounded-xl border px-4 py-3.5 shadow-sm transition-colors ${
        muted
          ? "border-slate-200/70 bg-slate-50/40"
          : "border-slate-200/70 bg-white/90 hover:border-slate-300/80"
      }`}
    >
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <div className="mt-2 flex flex-1 flex-col justify-center">{children}</div>
    </div>
  );
}

export function ResidentDashboard({ applicationApproved = false }: { applicationApproved?: boolean }) {
  if (applicationApproved) {
    return (
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="rounded-xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50/95 to-white px-4 py-3.5 shadow-sm sm:px-5 sm:py-4">
          <p className="text-sm font-semibold text-emerald-950">Application approved</p>
          <p className="mt-1 max-w-prose text-sm leading-relaxed text-emerald-900/90">
            Your lease workspace is open. Use the sidebar or the cards below for leases, payments, maintenance, and
            messages.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Lease">
            <p className="text-sm font-medium text-slate-700">Active lease</p>
            <p className="mt-1 text-xs leading-snug text-slate-500">Review documents and renewal dates.</p>
            <Link
              href="/resident/leases"
              className="mt-3 inline-flex w-fit rounded-lg border border-primary/25 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/10"
            >
              Open leases
            </Link>
          </StatCard>
          <StatCard label="Total payment due">
            <p className="text-sm font-semibold tabular-nums text-slate-900">$950.00</p>
            <p className="mt-1 text-xs leading-snug text-slate-500">Due May 1 · autopay off</p>
            <Link
              href="/resident/payments"
              className="mt-3 inline-flex w-fit rounded-lg border border-primary/25 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/10"
            >
              View payments
            </Link>
          </StatCard>
          <StatCard label="Work orders">
            <p className="text-sm font-medium text-slate-700">1 open</p>
            <p className="mt-1 text-xs leading-snug text-slate-500">Maintenance: sink leak (demo)</p>
            <Link
              href="/resident/work-orders"
              className="mt-3 inline-flex w-fit rounded-lg border border-primary/25 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/10"
            >
              View work orders
            </Link>
          </StatCard>
          <StatCard label="Your home" muted>
            <p className="text-sm font-medium text-slate-700">Pioneer Heights · 2A</p>
            <p className="mt-1 text-xs leading-snug text-slate-500">Move-in details and building contacts (demo).</p>
          </StatCard>
        </div>
        <Link
          href="/resident/inbox"
          className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white/90 px-4 py-3.5 text-sm shadow-sm transition hover:border-primary/25 hover:bg-white"
        >
          <span className="font-medium text-slate-800">Inbox</span>
          <span className="shrink-0 text-sm font-medium text-primary">Open messages</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="rounded-xl border border-amber-200/60 bg-gradient-to-br from-amber-50/95 to-amber-50/40 px-4 py-3.5 shadow-sm ring-1 ring-amber-900/[0.04] sm:px-5 sm:py-4">
        <p className="text-sm font-semibold text-amber-950">Application under review</p>
        <p className="mt-1 max-w-prose text-sm leading-relaxed text-amber-900/85">
          A property manager still needs to approve your application before work orders, payments,
          leasing, and inbox are available.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Lease">
          <p className="text-sm font-medium text-slate-500">Not available yet</p>
          <p className="mt-1 text-xs leading-snug text-slate-500">Shows here once your application is approved.</p>
          <button
            type="button"
            disabled
            className="mt-3 w-fit cursor-not-allowed rounded-lg border border-slate-200/90 bg-white px-3 py-1.5 text-xs font-medium text-slate-400"
          >
            View lease
          </button>
        </StatCard>

        <StatCard label="Total payment due">
          <p className="text-sm font-medium text-slate-500">No balance</p>
          <p className="mt-1 text-xs leading-snug text-slate-500">Payment details appear after move-in is set up.</p>
        </StatCard>

        <StatCard label="Work orders">
          <p className="text-sm font-medium text-slate-500">None yet</p>
          <p className="mt-1 text-xs leading-snug text-slate-500">Submit and track maintenance once your lease is active.</p>
        </StatCard>

        <StatCard label="Your home" muted>
          <p className="text-sm font-medium text-slate-600">Assigned after approval</p>
          <p className="mt-1 text-xs leading-snug text-slate-500">Unit and access details will populate in this card.</p>
        </StatCard>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-3.5 text-sm text-slate-400">
        <span className="font-medium">Inbox</span>
        <span className="shrink-0 text-xs font-medium">Available after approval</span>
      </div>
    </div>
  );
}
