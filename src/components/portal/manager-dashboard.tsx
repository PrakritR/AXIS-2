"use client";

import Link from "next/link";
import {
  demoApplicantRows,
  demoPaymentRows,
  demoPropertyCards,
  demoWorkOrderRows,
} from "@/data/demo-portal";
import { ManagerSectionShell, PortalPropertyFilter } from "./manager-section-shell";

function StatLink({ label, value, href }: { label: string; value: string; href: string }) {
  return (
    <Link
      href={href}
      className="rounded-2xl border border-slate-200/80 bg-slate-50/60 px-4 py-4 transition hover:border-primary/25 hover:bg-white hover:shadow-sm"
    >
      <p className="text-2xl font-bold tabular-nums text-slate-900">{value}</p>
      <p className="mt-1 text-xs font-medium text-slate-500">{label}</p>
    </Link>
  );
}

export function ManagerDashboard() {
  return (
    <ManagerSectionShell title="Dashboard" filters={<PortalPropertyFilter />} actions={[{ label: "Refresh", variant: "outline" }]}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatLink label="Properties" value={String(demoPropertyCards.length)} href="/manager/properties" />
        <StatLink label="Applications" value={String(demoApplicantRows.length)} href="/manager/applications" />
        <StatLink label="Leases" value="4" href="/manager/leases" />
        <StatLink label="Payments" value={String(demoPaymentRows.length)} href="/manager/payments" />
        <StatLink label="Work orders" value={String(demoWorkOrderRows.length)} href="/manager/work-orders" />
        <StatLink label="Inbox" value="5" href="/manager/inbox" />
      </div>
    </ManagerSectionShell>
  );
}
