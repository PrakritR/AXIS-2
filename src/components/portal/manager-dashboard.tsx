"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";

function StatCard({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-2xl border border-sky-200/80 bg-white px-4 py-4 shadow-[0_8px_32px_-16px_rgba(59,102,245,0.18)] transition hover:border-[#3b66f5]/40"
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#3b66f5]">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums text-slate-400">{value}</p>
    </Link>
  );
}

export function ManagerDashboard() {
  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-sky-200/80 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.22),_transparent_40%),linear-gradient(180deg,_rgba(255,255,255,0.98),_rgba(248,250,252,0.96))] p-6 sm:p-8">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sky-700/70">Manager portal</p>
        <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <h1 className="text-3xl font-semibold tracking-[-0.03em] text-slate-950 sm:text-4xl">Daily operations at a glance</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600 sm:text-[15px]">
              Stay on top of leasing, billing, maintenance, and resident communications without hopping between tabs.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/manager/inbox"
              className="inline-flex items-center justify-center rounded-full bg-[linear-gradient(135deg,#007aff,#339cff)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_4px_20px_rgba(0,122,255,0.28)] transition hover:-translate-y-0.5 hover:shadow-[0_8px_28px_-4px_rgba(0,122,255,0.42)]"
            >
              Open inbox
            </Link>
            <Link
              href="/manager/calendar"
              className="inline-flex items-center justify-center rounded-full border border-black/[0.1] bg-white/80 px-5 py-2.5 text-sm font-semibold text-[#1d1d1f] shadow-sm transition hover:-translate-y-px hover:bg-white hover:shadow-md"
            >
              Share availability
            </Link>
          </div>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Properties · live" value="3" href="/manager/properties" />
        <StatCard label="Leases · action needed" value="5" href="/manager/leases" />
        <StatCard label="Applications · pending" value="11" href="/manager/applications" />
        <StatCard label="Billing · outstanding" value="$1.9k" href="/manager/payments" />
        <StatCard label="Work orders · open" value="4" href="/manager/work-orders" />
        <StatCard label="Calendar · this week" value="8" href="/manager/calendar" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Link
          href="/manager/inbox"
          className="flex items-center justify-between rounded-2xl border border-sky-200/80 bg-white px-5 py-4 shadow-[0_8px_32px_-16px_rgba(59,102,245,0.18)] transition hover:border-[#3b66f5]/40"
        >
          <div>
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#3b66f5]">Inbox</span>
            <p className="mt-2 text-sm text-slate-600">4 priority messages and 2 vendor replies are waiting for review.</p>
          </div>
          <span className="text-sm font-semibold text-[#3b66f5]">Open messages →</span>
        </Link>

        <Link
          href="/manager/calendar"
          className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white px-5 py-4 shadow-[0_8px_32px_-16px_rgba(15,23,42,0.12)] transition hover:border-slate-300"
        >
          <div>
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Availability</span>
            <p className="mt-2 text-sm text-slate-600">12 public booking slots are open for the week.</p>
          </div>
          <span className="text-sm font-semibold text-slate-700">Edit schedule →</span>
        </Link>
      </div>
    </div>
  );
}
