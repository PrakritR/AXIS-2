"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { DEMO_RESIDENT_DISPLAY_NAME, DEMO_RESIDENT_UNIT } from "@/data/demo-portal";

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
      className={`flex min-h-[7.5rem] flex-col rounded-2xl border px-4 py-3.5 shadow-sm transition-colors ${
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
      <div className="mx-auto max-w-6xl space-y-4">
        <p className="rounded-2xl border border-emerald-200/70 bg-emerald-50/90 px-4 py-2.5 text-sm font-medium text-emerald-950">
          Application approved · {DEMO_RESIDENT_DISPLAY_NAME}
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Lease">
            <p className="text-sm font-semibold text-slate-900">Active</p>
            <Link
              href="/resident/leases"
              className="mt-2 inline-flex w-fit rounded-full border border-slate-200/90 bg-white px-3 py-1.5 text-xs font-semibold text-primary"
            >
              Open
            </Link>
          </StatCard>
          <StatCard label="Payment due">
            <p className="text-sm font-semibold tabular-nums text-slate-900">$950.00</p>
            <Link
              href="/resident/payments"
              className="mt-2 inline-flex w-fit rounded-full border border-slate-200/90 bg-white px-3 py-1.5 text-xs font-semibold text-primary"
            >
              Open
            </Link>
          </StatCard>
          <StatCard label="Work orders">
            <p className="text-sm font-semibold text-slate-900">1 open</p>
            <Link
              href="/resident/work-orders"
              className="mt-2 inline-flex w-fit rounded-full border border-slate-200/90 bg-white px-3 py-1.5 text-xs font-semibold text-primary"
            >
              Open
            </Link>
          </StatCard>
          <StatCard label="Home" muted>
            <p className="text-sm font-medium text-slate-800">{DEMO_RESIDENT_UNIT}</p>
          </StatCard>
        </div>
        <Link
          href="/resident/inbox"
          className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-sm font-medium shadow-sm transition hover:border-primary/25"
        >
          <span className="text-slate-800">Inbox</span>
          <span className="text-primary">Open</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <p className="rounded-2xl border border-amber-200/70 bg-amber-50/90 px-4 py-2.5 text-sm font-medium text-amber-950">
        Application under review
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Lease">
          <p className="text-sm text-slate-500">Soon</p>
        </StatCard>

        <StatCard label="Payment due">
          <p className="text-sm text-slate-500">—</p>
        </StatCard>

        <StatCard label="Work orders">
          <p className="text-sm text-slate-500">—</p>
        </StatCard>

        <StatCard label="Home" muted>
          <p className="text-sm text-slate-500">After approval</p>
        </StatCard>
      </div>
    </div>
  );
}
