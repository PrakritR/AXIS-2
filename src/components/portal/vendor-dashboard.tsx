"use client";

import { useEffect, useMemo, useState } from "react";
import type { DemoManagerWorkOrderRow } from "@/data/demo-portal";
import {
  ManagerPortalPageShell,
  portalDashboardWelcomeSubtitle,
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

/** Vendor Home — section previews in nav order: Services, Calendar, Messages, Payments. */
export function VendorDashboard({ displayName }: { displayName: string }) {
  const [tick, setTick] = useState(0);
  const bump = () => setTick((n) => n + 1);
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

    const upcomingVisits = rows
      .filter((r) => r.scheduledAtIso && r.bucket !== "completed")
      .sort((a, b) => (a.scheduledAtIso ?? "").localeCompare(b.scheduledAtIso ?? ""));

    const quotesPending = rows
      .filter((r) => r.biddingOpen && !r.biddingResolvedAt)
      .sort((a, b) => (b.biddingOpenedAt ?? "").localeCompare(a.biddingOpenedAt ?? ""));

    const pendingPayouts = rows
      .filter((r) => r.bucket === "completed" && r.automationStatus === "vendor_marked_done" && !r.paidAt)
      .sort((a, b) => (b.vendorMarkedDoneAt ?? b.completedAt ?? "").localeCompare(a.vendorMarkedDoneAt ?? a.completedAt ?? ""));

    const inboxThreads = loadPersistedInbox(VENDOR_INBOX_STORAGE_KEY, [])
      .filter((t) => t.folder === "inbox" && t.unread)
      .slice(0, 5);

    return { upcomingVisits, quotesPending, pendingPayouts, inboxThreads };
  }, [tick]);

  const { upcomingVisits, quotesPending, pendingPayouts, inboxThreads } = data;

  return (
    <ManagerPortalPageShell
      title="Dashboard"
      subtitle={portalDashboardWelcomeSubtitle(displayName)}
      hideTitleOnNative
    >
      <div className={PORTAL_DASHBOARD_STACK}>
        <div className="grid gap-4 lg:grid-cols-2 [html[data-native]_&]:gap-2.5">
          <div className={PORTAL_DASHBOARD_SECTION_CARD}>
            <PortalDashboardSectionHeader
              title="Services"
              href={`${BASE}/work-orders`}
              linkLabel="Services →"
              dataAttr="vendor-dashboard-services-link"
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

          <div className={PORTAL_DASHBOARD_SECTION_CARD}>
            <PortalDashboardSectionHeader
              title="Calendar"
              href={`${BASE}/calendar`}
              linkLabel="Calendar →"
              dataAttr="vendor-dashboard-calendar-link"
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
              title="Messages"
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
            <PortalDashboardSectionHeader
              title="Payments"
              href={`${BASE}/payments`}
              linkLabel="Payments →"
              dataAttr="vendor-dashboard-payments-link"
            />
            {!paymentsConnected ? (
              <p className="mt-4 text-sm text-muted">Link your bank under Payments to receive payouts for completed work.</p>
            ) : (
              <PortalDashboardPreviewList
                items={pendingPayouts}
                href={`${BASE}/payments`}
                emptyMessage="No payouts pending."
                keyForItem={(row) => row.id}
                renderRow={(row) => (
                  <PortalDashboardCompactRow
                    title={row.title}
                    subtitle={propertyLabel(row)}
                    badge={
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                        Awaiting payout
                      </span>
                    }
                  />
                )}
              />
            )}
          </div>
        </div>
      </div>
    </ManagerPortalPageShell>
  );
}
