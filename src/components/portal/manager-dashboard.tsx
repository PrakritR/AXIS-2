"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import {
  demoApplicantRows,
  demoKpis,
  demoManagerHouseRows,
  demoManagerLeaseDraftRows,
  demoManagerPaymentLedgerRows,
  demoManagerWorkOrderRowsFull,
} from "@/data/demo-portal";
import { MANAGER_APPLICATIONS_EVENT, readManagerApplicationRows } from "@/lib/manager-applications-storage";
import { readManagerWorkOrderRows, subscribeManagerWorkOrders } from "@/lib/manager-work-orders-storage";
import { ManagerPortalPageShell } from "@/components/portal/portal-metrics";
import { PortalPropertyFilter } from "./manager-section-shell";
import { PORTAL_KPI_LABEL, PORTAL_KPI_VALUE } from "./portal-metrics";

function StatLink({ label, value, href }: { label: string; value: string; href: string }) {
  return (
    <Link
      href={href}
      className="block rounded-xl border border-slate-200/80 bg-white px-5 py-4 transition hover:border-primary/35 hover:shadow-sm"
    >
      <p className={PORTAL_KPI_VALUE}>{value}</p>
      <p className={PORTAL_KPI_LABEL}>{label}</p>
    </Link>
  );
}

function subscribeManagerApplications(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(MANAGER_APPLICATIONS_EVENT, cb);
  return () => window.removeEventListener(MANAGER_APPLICATIONS_EVENT, cb);
}

export function ManagerDashboard() {
  const { showToast } = useAppUi();
  const pendingProperties = demoManagerHouseRows.filter((p) => p.bucket === "pending").length;
  const applicationRows = useSyncExternalStore(
    subscribeManagerApplications,
    () => readManagerApplicationRows(demoApplicantRows),
    () => demoApplicantRows,
  );
  const pendingApplications = applicationRows.filter((a) => a.bucket === "pending").length;

  const workOrderRows = useSyncExternalStore(
    subscribeManagerWorkOrders,
    () => readManagerWorkOrderRows(demoManagerWorkOrderRowsFull),
    () => demoManagerWorkOrderRowsFull,
  );

  return (
    <ManagerPortalPageShell
      title="Dashboard"
      titleAside={
        <>
          <div className="hidden sm:block">
            <PortalPropertyFilter />
          </div>
          <Button type="button" variant="outline" className="shrink-0 rounded-full" onClick={() => showToast("Dashboard refreshed (demo).")}>
            Refresh
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {Number(demoKpis.payments.overdue) > 0 ? (
          <p className="rounded-2xl border border-rose-200/80 bg-rose-50/70 px-4 py-3 text-sm text-rose-950">
            <span className="font-semibold">{demoKpis.payments.overdue}</span> payment line
            {Number(demoKpis.payments.overdue) === 1 ? " is" : "s are"} overdue.{" "}
            <Link className="font-semibold text-primary underline-offset-2 hover:underline" href="/manager/payments">
              Open payments
            </Link>
          </p>
        ) : null}
        {pendingProperties > 0 || pendingApplications > 0 ? (
          <p className="rounded-2xl border border-amber-200/80 bg-amber-50/70 px-4 py-3 text-sm text-amber-950">
            {pendingProperties > 0 ? (
              <>
                <span className="font-semibold">{pendingProperties}</span> propert{pendingProperties === 1 ? "y" : "ies"} pending
                approval.{" "}
                <Link className="font-semibold text-primary underline-offset-2 hover:underline" href="/manager/properties">
                  Review properties
                </Link>
              </>
            ) : null}
            {pendingProperties > 0 && pendingApplications > 0 ? <span className="mx-1">·</span> : null}
            {pendingApplications > 0 ? (
              <>
                <span className="font-semibold">{pendingApplications}</span> application{pendingApplications === 1 ? "" : "s"} need a
                decision.{" "}
                <Link className="font-semibold text-primary underline-offset-2 hover:underline" href="/manager/applications">
                  Open applications
                </Link>
              </>
            ) : null}
          </p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <StatLink label="Properties" value={String(demoManagerHouseRows.length)} href="/manager/properties" />
          <StatLink label="Applications" value={String(applicationRows.length)} href="/manager/applications" />
          <StatLink label="Leases" value={String(demoManagerLeaseDraftRows.length)} href="/manager/leases" />
          <StatLink label="Payments" value={String(demoManagerPaymentLedgerRows.length)} href="/manager/payments" />
          <StatLink label="Work orders" value={String(workOrderRows.length)} href="/manager/work-orders" />
          <StatLink label="Inbox" value="5" href="/manager/inbox/unopened" />
        </div>
      </div>
    </ManagerPortalPageShell>
  );
}
