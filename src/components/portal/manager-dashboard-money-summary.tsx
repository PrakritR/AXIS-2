"use client";

import Link from "next/link";

export function ManagerDashboardMoneySummary({
  totalUnpaidLabel,
  totalPastDueLabel,
  asOfLabel,
  paymentsHref,
}: {
  totalUnpaidLabel: string;
  totalPastDueLabel: string;
  asOfLabel: string;
  paymentsHref: string;
}) {
  return (
    <Link
      href={paymentsHref}
      className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-card p-3 shadow-[var(--shadow-sm)] transition hover:border-primary/25 sm:gap-3 sm:p-4"
      data-attr="dashboard-money-summary"
    >
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">Total unpaid</p>
        <p className="mt-1 text-lg font-bold tabular-nums tracking-tight text-foreground sm:text-xl">
          {totalUnpaidLabel}
        </p>
      </div>
      <div className="min-w-0 border-l border-border pl-3 sm:pl-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">Total past due</p>
        <p
          className="mt-1 text-lg font-bold tabular-nums tracking-tight text-[var(--status-overdue-fg)] sm:text-xl"
        >
          {totalPastDueLabel}
        </p>
      </div>
      <p className="col-span-2 text-[10px] font-medium uppercase tracking-[0.08em] text-muted/80">
        As of {asOfLabel}
      </p>
    </Link>
  );
}
