"use client";

import Link from "next/link";

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
      className="rounded-2xl border border-sky-200/80 bg-white px-4 py-4 shadow-[0_12px_40px_-28px_rgba(43,92,231,0.4)] transition hover:border-[#2b5ce7]/40"
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#2b5ce7]">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums text-[#2b5ce7]">{value}</p>
    </Link>
  );
}

export function ResidentDashboard() {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
        Application under review — a property manager still needs to approve your application before work orders,
        payments, leasing, and inbox are fully available.
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Properties · approved" value="0" href="/resident/properties" />
        <StatCard label="Leases · action needed" value="—" href="/resident/leases/manager-review" />
        <StatCard label="Applications · pending" value="—" href="/resident/applications/pending" />
        <StatCard label="Payments · total lines" value="—" href="/resident/payments/pending" />
        <StatCard label="Work orders · open" value="—" href="/resident/work-orders/open" />
        <StatCard label="Calendar · events" value="—" href="/resident/calendar/week" />
      </div>

      <Link
        href="/resident/inbox/unopened"
        className="flex items-center justify-between rounded-2xl border border-sky-200/80 bg-white px-5 py-4 shadow-[0_12px_40px_-28px_rgba(43,92,231,0.35)] transition hover:border-[#2b5ce7]/40"
      >
        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#2b5ce7]">Inbox</span>
        <span className="text-sm font-semibold text-[#2b5ce7]">Open messages →</span>
      </Link>
    </div>
  );
}
