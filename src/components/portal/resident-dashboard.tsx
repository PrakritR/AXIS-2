"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { PORTAL_SECTION_SURFACE } from "@/components/portal/portal-metrics";
import { demoResidentChargeRows, demoResidentInboxThreads } from "@/data/demo-portal";

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

export function ResidentDashboard({
  applicationApproved = false,
  showTestAccessNote = false,
  displayName = "Resident",
}: {
  applicationApproved?: boolean;
  /** Shown when full portal is unlocked via env allowlist but DB approval is still false. */
  showTestAccessNote?: boolean;
  displayName?: string;
}) {
  const inboxUnread = demoResidentInboxThreads.filter((t) => t.unread).length;
  const balanceDue = demoResidentChargeRows.find((c) => c.balance !== "$0.00")?.balance ?? "—";
  const openWorkOrders = 0;

  if (applicationApproved) {
    return (
      <div className={`mx-auto w-full max-w-[1600px] space-y-4 ${PORTAL_SECTION_SURFACE}`}>
        {showTestAccessNote ? (
          <p className="rounded-2xl border border-sky-200/80 bg-sky-50/90 px-4 py-2.5 text-sm font-medium text-sky-950">
            Test account: full resident portal is unlocked for this email while application approval is still pending in
            the database.
          </p>
        ) : (
          <p className="rounded-2xl border border-emerald-200/70 bg-emerald-50/90 px-4 py-2.5 text-sm font-medium text-emerald-950">
            Application approved · {displayName}
          </p>
        )}
        {balanceDue !== "—" ? (
          <p className="rounded-2xl border border-amber-200/80 bg-amber-50/70 px-4 py-2.5 text-sm text-amber-950">
            You have an outstanding balance of <span className="font-semibold tabular-nums">{balanceDue}</span>.{" "}
            <Link className="font-semibold text-primary underline-offset-2 hover:underline" href="/resident/payments">
              Pay in Payments
            </Link>
          </p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Lease">
            <p className="text-sm font-semibold text-slate-900">Active</p>
            <Link
              href="/resident/lease"
              className="mt-2 inline-flex w-fit rounded-full border border-slate-200/90 bg-white px-3 py-1.5 text-xs font-semibold text-primary"
            >
              Open
            </Link>
          </StatCard>
          <StatCard label="Payment due">
            <p className="text-sm font-semibold tabular-nums text-slate-900">—</p>
            <Link
              href="/resident/payments"
              className="mt-2 inline-flex w-fit rounded-full border border-slate-200/90 bg-white px-3 py-1.5 text-xs font-semibold text-primary"
            >
              Open
            </Link>
          </StatCard>
          <StatCard label="Work orders">
            <p className="text-sm font-semibold text-slate-900">{openWorkOrders} open</p>
            <Link
              href="/resident/work-orders"
              className="mt-2 inline-flex w-fit rounded-full border border-slate-200/90 bg-white px-3 py-1.5 text-xs font-semibold text-primary"
            >
              Open
            </Link>
          </StatCard>
          <StatCard label="Home" muted>
            <p className="text-sm font-medium text-slate-800">Your unit</p>
          </StatCard>
        </div>
        <Link
          href="/resident/inbox/unopened"
          className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-sm font-medium shadow-sm transition hover:border-primary/25"
        >
          <span className="flex items-center gap-2 text-slate-800">
            Inbox
            {inboxUnread > 0 ? (
              <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-white">{inboxUnread}</span>
            ) : null}
          </span>
          <span className="text-primary">Open</span>
        </Link>
      </div>
    );
  }

  return (
    <div className={`mx-auto w-full max-w-[1600px] space-y-4 ${PORTAL_SECTION_SURFACE}`}>
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
