"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import {
  demoApplicantRows,
  demoKpis,
  demoManagerHouseRows,
  demoManagerInboxThreads,
  demoManagerPaymentLedgerRows,
  demoManagerWorkOrderRowsFull,
} from "@/data/demo-portal";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import { adminKpiCounts } from "@/lib/demo-admin-property-inventory";
import { HOUSEHOLD_CHARGES_EVENT, readChargesForManager } from "@/lib/household-charges";
import { PROPERTY_PIPELINE_EVENT } from "@/lib/demo-property-pipeline";
import { LEASE_PIPELINE_EVENT, readLeasePipeline } from "@/lib/lease-pipeline-storage";
import { MANAGER_APPLICATIONS_EVENT, readManagerApplicationRows } from "@/lib/manager-applications-storage";
import {
  countUnopenedPersistedInbox,
  MANAGER_INBOX_STORAGE_KEY,
  OWNER_INBOX_STORAGE_KEY,
  PORTAL_INBOX_CHANGED_EVENT,
  type PersistedInboxThread,
} from "@/lib/portal-inbox-storage";
import { readManagerWorkOrderRows, subscribeManagerWorkOrders } from "@/lib/manager-work-orders-storage";
import { OwnerManagerAccountSwitch } from "@/components/portal/owner-manager-account-switch";
import { ManagerPortalPageShell } from "@/components/portal/portal-metrics";
import { PortalPropertyFilter } from "./manager-section-shell";
import { PORTAL_KPI_LABEL, PORTAL_KPI_VALUE } from "./portal-metrics";

function managerInboxFallback(): PersistedInboxThread[] {
  return demoManagerInboxThreads.map((t) => ({
    id: t.id,
    folder: t.folder,
    from: t.from,
    email: t.email,
    subject: t.subject,
    preview: t.preview,
    body: t.body,
    time: t.time,
    unread: t.unread,
  }));
}

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

export function ManagerDashboard() {
  const { showToast } = useAppUi();
  const pathname = usePathname();
  const portalBase = pathname.startsWith("/owner") ? "/owner" : "/manager";
  const { userId, ready } = useManagerUserId();

  const [pipelineTick, setPipelineTick] = useState(0);
  useEffect(() => {
    const on = () => setPipelineTick((n) => n + 1);
    window.addEventListener(PROPERTY_PIPELINE_EVENT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(PROPERTY_PIPELINE_EVENT, on);
      window.removeEventListener("storage", on);
    };
  }, []);

  const pipelineSummary = useMemo(() => {
    void pipelineTick;
    if (!userId) {
      return {
        pendingProperties: demoManagerHouseRows.filter((p) => p.bucket === "pending").length,
        totalProperties: demoManagerHouseRows.length,
      };
    }
    const [p0, p1, p2, p3, p4] = adminKpiCounts(userId);
    return {
      pendingProperties: p0,
      totalProperties: p0 + p1 + p2 + p3 + p4,
    };
  }, [userId, pipelineTick]);

  const [hcTick, setHcTick] = useState(0);
  useEffect(() => {
    const on = () => setHcTick((n) => n + 1);
    window.addEventListener(HOUSEHOLD_CHARGES_EVENT, on);
    return () => window.removeEventListener(HOUSEHOLD_CHARGES_EVENT, on);
  }, []);

  const paymentLineCount = useMemo(() => {
    void hcTick;
    if (!ready) return demoManagerPaymentLedgerRows.length;
    const fromHc = userId ? readChargesForManager(userId).length : readChargesForManager(null).length;
    return fromHc + demoManagerPaymentLedgerRows.length;
  }, [userId, hcTick, ready]);

  const [applicationRows, setApplicationRows] = useState(demoApplicantRows);
  useEffect(() => {
    const sync = () => setApplicationRows(readManagerApplicationRows(demoApplicantRows));
    sync();
    window.addEventListener(MANAGER_APPLICATIONS_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(MANAGER_APPLICATIONS_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const pendingApplications = applicationRows.filter((a) => a.bucket === "pending").length;

  const [leaseTick, setLeaseTick] = useState(0);
  useEffect(() => {
    const on = () => setLeaseTick((n) => n + 1);
    window.addEventListener(LEASE_PIPELINE_EVENT, on);
    window.addEventListener(MANAGER_APPLICATIONS_EVENT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(LEASE_PIPELINE_EVENT, on);
      window.removeEventListener(MANAGER_APPLICATIONS_EVENT, on);
      window.removeEventListener("storage", on);
    };
  }, []);

  const leasePipelineCount = useMemo(() => {
    void leaseTick;
    return readLeasePipeline().length;
  }, [leaseTick]);

  const [inboxTick, setInboxTick] = useState(0);
  useEffect(() => {
    const onStorage = () => setInboxTick((n) => n + 1);
    const onInboxEvent = (e: Event) => {
      const key = (e as CustomEvent<{ key?: string }>).detail?.key;
      const want = pathname.startsWith("/owner") ? OWNER_INBOX_STORAGE_KEY : MANAGER_INBOX_STORAGE_KEY;
      if (!key || key === want) setInboxTick((n) => n + 1);
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(PORTAL_INBOX_CHANGED_EVENT, onInboxEvent as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(PORTAL_INBOX_CHANGED_EVENT, onInboxEvent as EventListener);
    };
  }, [pathname]);

  const inboxUnopenedCount = useMemo(() => {
    void inboxTick;
    const key = pathname.startsWith("/owner") ? OWNER_INBOX_STORAGE_KEY : MANAGER_INBOX_STORAGE_KEY;
    const fallback = pathname.startsWith("/owner") ? [] : managerInboxFallback();
    return countUnopenedPersistedInbox(key, fallback);
  }, [pathname, inboxTick]);

  const [workOrderRows, setWorkOrderRows] = useState(demoManagerWorkOrderRowsFull);
  useEffect(() => {
    const sync = () => setWorkOrderRows(readManagerWorkOrderRows(demoManagerWorkOrderRowsFull));
    sync();
    const sub = subscribeManagerWorkOrders(sync);
    return () => sub();
  }, []);

  return (
    <ManagerPortalPageShell
      title="Dashboard"
      titleAside={
        <>
          <OwnerManagerAccountSwitch />
          <div className="hidden sm:block">
            <PortalPropertyFilter />
          </div>
          <Button type="button" variant="outline" className="shrink-0 rounded-full" onClick={() => showToast("Dashboard refreshed.")}>
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
            <Link className="font-semibold text-primary underline-offset-2 hover:underline" href={`${portalBase}/payments/ledger`}>
              Open payments
            </Link>
          </p>
        ) : null}
        {pipelineSummary.pendingProperties > 0 || pendingApplications > 0 ? (
          <p className="rounded-2xl border border-amber-200/80 bg-amber-50/70 px-4 py-3 text-sm text-amber-950">
            {pipelineSummary.pendingProperties > 0 ? (
              <>
                <span className="font-semibold">{pipelineSummary.pendingProperties}</span> propert
                {pipelineSummary.pendingProperties === 1 ? "y" : "ies"} pending approval.{" "}
                <Link className="font-semibold text-primary underline-offset-2 hover:underline" href={`${portalBase}/properties`}>
                  Review properties
                </Link>
              </>
            ) : null}
            {pipelineSummary.pendingProperties > 0 && pendingApplications > 0 ? <span className="mx-1">·</span> : null}
            {pendingApplications > 0 ? (
              <>
                <span className="font-semibold">{pendingApplications}</span> application{pendingApplications === 1 ? "" : "s"} need a
                decision.{" "}
                <Link className="font-semibold text-primary underline-offset-2 hover:underline" href={`${portalBase}/applications`}>
                  Open applications
                </Link>
              </>
            ) : null}
          </p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <StatLink label="Properties" value={String(pipelineSummary.totalProperties)} href={`${portalBase}/properties`} />
          <StatLink label="Applications" value={String(applicationRows.length)} href={`${portalBase}/applications`} />
          <StatLink label="Leases" value={String(leasePipelineCount)} href={`${portalBase}/leases`} />
          <StatLink label="Payments" value={String(paymentLineCount)} href={`${portalBase}/payments/ledger`} />
          <StatLink label="Work orders" value={String(workOrderRows.length)} href={`${portalBase}/work-orders`} />
          <StatLink label="Inbox" value={String(inboxUnopenedCount)} href={`${portalBase}/inbox/unopened`} />
        </div>
      </div>
    </ManagerPortalPageShell>
  );
}
