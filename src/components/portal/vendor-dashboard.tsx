"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
import { Button } from "@/components/ui/button";
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

const CONTACT_NUDGE_DISMISSED_KEY = "axis_vendor_contact_nudge_dismissed";

function readContactNudgeDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(CONTACT_NUDGE_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

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
  const router = useRouter();
  const [tick, setTick] = useState(0);
  const bump = () => setTick((n) => n + 1);
  const [paymentsConnected, setPaymentsConnected] = useState(false);
  const [needsContact, setNeedsContact] = useState(false);
  const [contactNudgeDismissed, setContactNudgeDismissed] = useState(false);

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

  useEffect(() => {
    setContactNudgeDismissed(readContactNudgeDismissed());
    if (isDemoModeActive()) return;
    void fetch("/api/vendor/profile", { credentials: "include" })
      .then((r) => r.json())
      .then((data: { contact?: { phone?: string; smsConsent?: boolean } }) => {
        setNeedsContact(!data.contact?.phone || !data.contact?.smsConsent);
      })
      .catch(() => undefined);
  }, []);

  function dismissContactNudge() {
    setContactNudgeDismissed(true);
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(CONTACT_NUDGE_DISMISSED_KEY, "1");
    } catch {
      /* ignore */
    }
  }

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
        {needsContact && !contactNudgeDismissed ? (
          <div className={PORTAL_DASHBOARD_SECTION_CARD}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">Get job offers by text</p>
                <p className="mt-1 text-sm text-muted">
                  Add your phone number so managers and Axis can reach you about jobs.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  variant="primary"
                  data-attr="vendor-contact-nudge-add-phone"
                  onClick={() => router.push(`${BASE}/profile`)}
                >
                  Add phone
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0 rounded-full px-3 py-1 text-xs"
                  onClick={dismissContactNudge}
                >
                  Dismiss
                </Button>
              </div>
            </div>
          </div>
        ) : null}
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
