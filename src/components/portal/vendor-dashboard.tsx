"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { DemoManagerWorkOrderRow } from "@/data/demo-portal";
import {
  ManagerPortalPageShell,
  PortalDashboardCompactRow,
  PortalDashboardPreviewList,
  PortalDashboardSectionHeader,
  PORTAL_DASHBOARD_SECTION_CARD,
  PORTAL_DASHBOARD_STACK,
} from "@/components/portal/portal-metrics";
import { WorkOrderStatusBadge } from "@/components/portal/resident-services-panel";
import { isDemoModeActive } from "@/lib/demo/demo-session";
import {
  MANAGER_WORK_ORDERS_EVENT,
  readVendorWorkOrderRows,
  syncManagerWorkOrdersFromServer,
} from "@/lib/manager-work-orders-storage";
import { formatPacificDateTime } from "@/lib/pacific-time";
import {
  loadPersistedInbox,
  PORTAL_INBOX_CHANGED_EVENT,
  syncPersistedInboxFromServer,
  VENDOR_INBOX_STORAGE_KEY,
} from "@/lib/portal-inbox-storage";

const BASE = "/vendor";

function fmt(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "soon";
  return formatPacificDateTime(d);
}

function propertyLabel(row: DemoManagerWorkOrderRow): string {
  const unit = row.unit?.trim();
  return unit && unit !== "—" ? `${row.propertyName} · ${unit}` : row.propertyName;
}

function ChecklistItem({
  done,
  title,
  description,
  href,
  dataAttr,
}: {
  done: boolean;
  title: string;
  description: string;
  href: string;
  dataAttr: string;
}) {
  return (
    <Link
      href={href}
      data-attr={dataAttr}
      className="flex items-start gap-3 rounded-xl bg-accent/30 px-3 py-2.5 transition hover:bg-accent/50"
    >
      <span
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          done ? "bg-[var(--status-success-fg)]/15 text-[var(--status-success-fg)]" : "border border-border text-muted"
        }`}
        aria-hidden
      >
        {done ? "✓" : ""}
      </span>
      <span>
        <span className="block text-sm font-medium text-foreground">{title}</span>
        <span className="mt-0.5 block text-xs text-muted">{description}</span>
      </span>
    </Link>
  );
}

/** Vendor Home — section previews and getting-started checklist. */
export function VendorDashboard({ displayName }: { displayName: string }) {
  const [tick, setTick] = useState(0);
  const bump = () => setTick((n) => n + 1);
  const [profileComplete, setProfileComplete] = useState(false);
  const [paymentsConnected, setPaymentsConnected] = useState(false);

  useEffect(() => {
    void Promise.allSettled([
      syncManagerWorkOrdersFromServer(),
      syncPersistedInboxFromServer(VENDOR_INBOX_STORAGE_KEY),
    ]).then(bump);
    window.addEventListener(MANAGER_WORK_ORDERS_EVENT, bump);
    window.addEventListener(PORTAL_INBOX_CHANGED_EVENT, bump);
    window.addEventListener("storage", bump);
    return () => {
      window.removeEventListener(MANAGER_WORK_ORDERS_EVENT, bump);
      window.removeEventListener(PORTAL_INBOX_CHANGED_EVENT, bump);
      window.removeEventListener("storage", bump);
    };
  }, []);

  useEffect(() => {
    if (isDemoModeActive()) return;
    void fetch("/api/vendor/tax-profile", { credentials: "include" })
      .then((r) => r.json())
      .then((data: { profile?: { w9_attestation?: boolean; legal_name?: string } | null }) => {
        setProfileComplete(Boolean(data.profile?.w9_attestation || data.profile?.legal_name));
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (isDemoModeActive()) {
      setPaymentsConnected(true);
      return;
    }
    void fetch("/api/vendor/stripe-connect/status", { credentials: "include" })
      .then((r) => r.json())
      .then((data: { paymentReady?: boolean; transfersEnabled?: boolean; payoutsEnabled?: boolean }) => {
        setPaymentsConnected(Boolean(data.paymentReady ?? (data.transfersEnabled && data.payoutsEnabled)));
      })
      .catch(() => undefined);
  }, []);

  const data = useMemo(() => {
    void tick;
    const rows = readVendorWorkOrderRows();

    const activeRows = rows
      .filter((r) => r.bucket !== "completed")
      .sort((a, b) => (a.scheduledAtIso ?? "").localeCompare(b.scheduledAtIso ?? ""));

    const upcomingVisits = rows
      .filter((r) => r.scheduledAtIso && r.bucket !== "completed")
      .sort((a, b) => (a.scheduledAtIso ?? "").localeCompare(b.scheduledAtIso ?? ""));

    const quotesPending = rows
      .filter((r) => r.biddingOpen && !r.biddingResolvedAt)
      .sort((a, b) => (b.biddingOpenedAt ?? "").localeCompare(a.biddingOpenedAt ?? ""));

    const inboxThreads = loadPersistedInbox(VENDOR_INBOX_STORAGE_KEY, [])
      .filter((t) => t.folder === "inbox" && t.unread)
      .slice(0, 5);

    return { activeRows, upcomingVisits, quotesPending, inboxThreads };
  }, [tick]);

  const { activeRows, upcomingVisits, quotesPending, inboxThreads } = data;

  return (
    <ManagerPortalPageShell title="Dashboard" subtitle={`Welcome, ${displayName}`} hideTitleOnNative>
      <div className={PORTAL_DASHBOARD_STACK}>

        {/* ── Visits & work orders ── */}
        <div className="grid gap-4 lg:grid-cols-2 [html[data-native]_&]:gap-2.5">

          <div className={PORTAL_DASHBOARD_SECTION_CARD}>
            <PortalDashboardSectionHeader
              title="Upcoming visits"
              href={`${BASE}/calendar`}
              linkLabel="Calendar →"
              dataAttr="vendor-dashboard-visits-calendar-link"
            />
            <PortalDashboardPreviewList
              items={upcomingVisits}
              href={`${BASE}/calendar`}
              emptyMessage="No upcoming visits yet."
              keyForItem={(row) => row.id}
              renderRow={(row) => (
                <PortalDashboardCompactRow
                  title={row.title}
                  subtitle={[propertyLabel(row), fmt(row.scheduledAtIso ?? "")].filter(Boolean).join(" · ")}
                  badge={<WorkOrderStatusBadge bucket={row.bucket} />}
                />
              )}
            />
          </div>

          <div className={PORTAL_DASHBOARD_SECTION_CARD}>
            <PortalDashboardSectionHeader
              title="Awaiting your quote"
              href={`${BASE}/work-orders`}
              linkLabel="Work Orders →"
              dataAttr="vendor-dashboard-quotes-work-orders-link"
              badge={
                quotesPending.length > 0 ? (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold tabular-nums text-[var(--status-pending-fg)]">
                    <span aria-hidden className="size-1.5 rounded-full bg-current" />
                    {quotesPending.length} pending
                  </span>
                ) : null
              }
            />
            <PortalDashboardPreviewList
              items={quotesPending}
              href={`${BASE}/work-orders`}
              emptyMessage="No offers awaiting your quote."
              keyForItem={(row) => row.id}
              renderRow={(row) => (
                <PortalDashboardCompactRow
                  title={row.title}
                  subtitle={propertyLabel(row)}
                  badge={
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                      Awaiting quote
                    </span>
                  }
                />
              )}
            />
          </div>

        </div>

        {/* ── Messages & getting started ── */}
        <div className="grid gap-4 lg:grid-cols-2 [html[data-native]_&]:gap-2.5">

          <div className={PORTAL_DASHBOARD_SECTION_CARD}>
            <PortalDashboardSectionHeader
              title="Recent messages"
              href={`${BASE}/inbox/unopened`}
              linkLabel="Inbox →"
              dataAttr="vendor-dashboard-messages-inbox-link"
            />
            <PortalDashboardPreviewList
              items={inboxThreads}
              href={`${BASE}/inbox/unopened`}
              emptyMessage="No unread messages — inbox is clear."
              keyForItem={(thread) => thread.id}
              renderRow={(thread) => (
                <PortalDashboardCompactRow
                  title={thread.from || "Unknown sender"}
                  subtitle={thread.subject || thread.preview || "—"}
                  badge={
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-800">
                      Unread
                    </span>
                  }
                />
              )}
            />
          </div>

          <div className={PORTAL_DASHBOARD_SECTION_CARD}>
            <PortalDashboardSectionHeader title="Getting started" />
            <div className="mt-3 space-y-2">
              <ChecklistItem
                done={profileComplete}
                title="Complete tax info"
                description="Add your W-9 details under Payments so managers can pay you correctly."
                href="/vendor/payments"
                dataAttr="vendor-dashboard-checklist-profile"
              />
              <ChecklistItem
                done={paymentsConnected}
                title="Connect payments"
                description="Link your Stripe account to get paid directly for completed work orders."
                href="/vendor/payments"
                dataAttr="vendor-dashboard-checklist-payments"
              />
              <ChecklistItem
                done={activeRows.length > 0}
                title="See your work orders"
                description="Work offered or assigned to you appears here automatically."
                href="/vendor/work-orders"
                dataAttr="vendor-dashboard-checklist-work-orders"
              />
            </div>
          </div>

        </div>
      </div>
    </ManagerPortalPageShell>
  );
}
