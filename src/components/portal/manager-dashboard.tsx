"use client";

import { useEffect, useMemo, useState } from "react";
import type { DemoApplicantRow } from "@/data/demo-portal";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import {
  getPartnerInquiryWindows,
  readPartnerInquiries,
  readPlannedEvents,
  syncScheduleRecordsFromServer,
} from "@/lib/demo-admin-scheduling";
import { ADMIN_UI_EVENT } from "@/lib/demo-admin-ui";
import { PROPERTY_PIPELINE_EVENT } from "@/lib/demo-property-pipeline";
import {
  chargeDueLabel,
  HOUSEHOLD_CHARGES_EVENT,
  isHouseholdChargeOverdue,
  readChargesForManager,
  syncHouseholdChargesFromServer,
} from "@/lib/household-charges";
import type { LeasePipelineRow } from "@/lib/lease-pipeline-storage";
import {
  LEASE_PIPELINE_EVENT,
  readLeasePipeline,
  syncLeasePipelineFromServer,
} from "@/lib/lease-pipeline-storage";
import {
  MANAGER_APPLICATIONS_EVENT,
  readManagerApplicationRows,
  syncManagerApplicationsFromServer,
} from "@/lib/manager-applications-storage";
import {
  applicationVisibleToPortalUser,
} from "@/lib/manager-portfolio-access";
import {
  MANAGER_WORK_ORDERS_EVENT,
  readManagerWorkOrderRows,
  syncManagerWorkOrdersFromServer,
} from "@/lib/manager-work-orders-storage";
import {
  readServiceRequestsForManager,
  SERVICE_REQUESTS_EVENT,
  syncServiceRequestsFromServer,
} from "@/lib/service-requests-storage";
import {
  loadPersistedInbox,
  MANAGER_INBOX_STORAGE_KEY,
  PORTAL_INBOX_CHANGED_EVENT,
  syncPersistedInboxFromServer,
} from "@/lib/portal-inbox-storage";
import {
  ManagerPortalPageShell,
  portalDashboardWelcomeSubtitle,
  PortalDashboardCompactRow,
  PortalDashboardPreviewList,
  PortalDashboardSectionHeader,
  PORTAL_DASHBOARD_SECTION_CARD,
  PORTAL_DASHBOARD_STACK,
  formatCompactChargeLine,
  formatCompactPlacementLine,
} from "@/components/portal/portal-metrics";
import { isSubmittedPendingApplicationRow } from "@/lib/rental-application/in-progress-application";
import { formatPacificDateTime } from "@/lib/pacific-time";

const BASE = "/portal";

function fmt(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "soon";
  return formatPacificDateTime(d);
}

export function ManagerDashboard({ displayName = "there" }: { displayName?: string }) {
  const { userId, ready: authReady } = useManagerUserId();
  const [tick, setTick] = useState(0);
  const bump = () => setTick((n) => n + 1);
  const [nowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!authReady || !userId) {
      return;
    }
    void Promise.allSettled([
      syncManagerApplicationsFromServer({ managerUserId: userId }),
      syncLeasePipelineFromServer(userId),
      syncPersistedInboxFromServer(MANAGER_INBOX_STORAGE_KEY),
      syncHouseholdChargesFromServer(true),
      syncScheduleRecordsFromServer(),
      syncManagerWorkOrdersFromServer(),
      syncServiceRequestsFromServer(),
    ]).then(bump);
    window.addEventListener(PROPERTY_PIPELINE_EVENT, bump);
    window.addEventListener(LEASE_PIPELINE_EVENT, bump);
    window.addEventListener(MANAGER_APPLICATIONS_EVENT, bump);
    window.addEventListener(HOUSEHOLD_CHARGES_EVENT, bump);
    window.addEventListener(ADMIN_UI_EVENT, bump);
    window.addEventListener(PORTAL_INBOX_CHANGED_EVENT, bump);
    window.addEventListener(MANAGER_WORK_ORDERS_EVENT, bump);
    window.addEventListener(SERVICE_REQUESTS_EVENT, bump);
    window.addEventListener("storage", bump);
    return () => {
      window.removeEventListener(PROPERTY_PIPELINE_EVENT, bump);
      window.removeEventListener(LEASE_PIPELINE_EVENT, bump);
      window.removeEventListener(MANAGER_APPLICATIONS_EVENT, bump);
      window.removeEventListener(HOUSEHOLD_CHARGES_EVENT, bump);
      window.removeEventListener(ADMIN_UI_EVENT, bump);
      window.removeEventListener(PORTAL_INBOX_CHANGED_EVENT, bump);
      window.removeEventListener(MANAGER_WORK_ORDERS_EVENT, bump);
      window.removeEventListener(SERVICE_REQUESTS_EVENT, bump);
      window.removeEventListener("storage", bump);
    };
  }, [userId, authReady]);

  const data = useMemo(() => {
    void tick;
    if (!userId) return null;

    const allApps = readManagerApplicationRows().filter((a) => applicationVisibleToPortalUser(a, userId));
    const pendingApps = allApps.filter((a) => isSubmittedPendingApplicationRow(a));

    const leases = readLeasePipeline(userId);
    const pendingLeaseRows = leases
      .filter((l) => l.status === "Manager Signature Pending" || l.status === "Resident Signature Pending")
      .sort((a, b) => new Date(b.updatedAtIso).getTime() - new Date(a.updatedAtIso).getTime());

    const charges = readChargesForManager(userId);
    const pendingCharges = charges
      .filter((c) => c.status === "pending")
      .sort((a, b) => {
        const aOverdue = isHouseholdChargeOverdue(a);
        const bOverdue = isHouseholdChargeOverdue(b);
        if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
    const managerWorkOrders = readManagerWorkOrderRows().filter(
      (w) => !w.managerUserId || w.managerUserId === userId,
    );
    const pendingServiceRequests = readServiceRequestsForManager(userId).filter(
      (r) => r.status === "pending",
    );
    const pendingWorkOrders = managerWorkOrders.filter((w) => w.bucket === "open");
    const serviceItems = [
      ...pendingServiceRequests.map((r) => ({
        id: `sr-${r.id}`,
        title: r.offerName || "Service request",
        subtitle: [r.residentName || r.residentEmail, r.price].filter(Boolean).join(" · ") || "—",
        status: "pending" as const,
        sortKey: new Date(r.requestedAt).getTime() || 0,
      })),
      ...pendingWorkOrders.map((w) => ({
        id: `wo-${w.id}`,
        title: w.title || "Work order",
        subtitle: [w.propertyName, w.unit].filter(Boolean).join(" · ") || "—",
        status: "pending" as const,
        sortKey: w.scheduledAtIso ? new Date(w.scheduledAtIso).getTime() : 0,
      })),
    ].sort((a, b) => b.sortKey - a.sortKey);
    const pendingServiceCount = pendingServiceRequests.length + pendingWorkOrders.length;

    const inboxThreads = loadPersistedInbox(MANAGER_INBOX_STORAGE_KEY, [])
      .filter((t) => t.folder === "inbox" && t.unread)
      .slice(0, 5);

    const cutoff = nowMs - 30 * 60 * 1000;
    const tours = [
      ...readPartnerInquiries()
        .filter((r) => r.kind === "tour" && r.status === "pending" && r.managerUserId === userId)
        .flatMap((r) =>
          getPartnerInquiryWindows(r).map((w) => ({
            id: `${r.id}-${w.start}`,
            label: r.name,
            propertyTitle: r.propertyTitle ?? "",
            status: "pending" as const,
            startMs: new Date(w.start).getTime(),
            start: w.start,
          })),
        ),
      ...readPlannedEvents()
        .filter((e) => e.kind === "tour" && e.managerUserId === userId)
        .map((e) => ({
          id: e.id,
          label: e.attendeeName ?? "Confirmed tour",
          propertyTitle: e.propertyTitle ?? "",
          status: "confirmed" as const,
          startMs: new Date(e.start).getTime(),
          start: e.start,
        })),
    ]
      .filter((t) => Number.isFinite(t.startMs) && t.startMs >= cutoff)
      .sort((a, b) => a.startMs - b.startMs);

    return {
      pendingApps,
      pendingLeaseRows,
      pendingCharges,
      inboxThreads,
      serviceItems,
      pendingServiceCount,
      tours,
    };
  }, [tick, userId, nowMs]);

  if (!data) return null;

  const {
    pendingApps,
    pendingLeaseRows,
    pendingCharges,
    inboxThreads,
    serviceItems,
    pendingServiceCount,
    tours,
  } = data;

  const pendingTours = tours.filter((t) => t.status === "pending");
  const overdueChargeCount = pendingCharges.filter((c) => isHouseholdChargeOverdue(c)).length;

  return (
    <ManagerPortalPageShell
      title="Dashboard"
      subtitle={portalDashboardWelcomeSubtitle(displayName)}
      hideTitleOnNative
    >
      <div className={PORTAL_DASHBOARD_STACK}>

        {/* ── Calendar & applications ── */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 [html[data-native]_&]:gap-2.5">

          {/* Pending tours */}
          <div className={PORTAL_DASHBOARD_SECTION_CARD}>
            <PortalDashboardSectionHeader
              title="Pending tour requests"
              href={`${BASE}/calendar`}
              linkLabel="Calendar →"
            />
            <PortalDashboardPreviewList
              items={pendingTours}
              href={`${BASE}/calendar`}
              emptyMessage="No pending tour requests right now."
              keyForItem={(tour) => tour.id}
              renderRow={(tour) => (
                <PortalDashboardCompactRow
                  title={tour.label}
                  subtitle={[tour.propertyTitle || "—", fmt(tour.start)].filter(Boolean).join(" · ")}
                  badge={
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                      Pending
                    </span>
                  }
                />
              )}
            />
          </div>

          {/* Pending applications */}
          <div className={PORTAL_DASHBOARD_SECTION_CARD}>
            <PortalDashboardSectionHeader
              title="Pending applications"
              href={`${BASE}/applications`}
              linkLabel="Applications →"
            />
            <PortalDashboardPreviewList
              items={pendingApps}
              href={`${BASE}/applications`}
              emptyMessage="No pending applications — you're all caught up."
              keyForItem={(app) => app.id}
              renderRow={(app: DemoApplicantRow) => (
                <PortalDashboardCompactRow
                  title={app.name || app.email || "Unknown"}
                  subtitle={app.property || "—"}
                  badge={
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                      {app.stage || "Pending"}
                    </span>
                  }
                />
              )}
            />
          </div>

        </div>

        {/* ── Leases & payments ── */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 [html[data-native]_&]:gap-2.5">
          <div className={PORTAL_DASHBOARD_SECTION_CARD}>
            <PortalDashboardSectionHeader
              title="Leases pending signature"
              href={`${BASE}/leases`}
              linkLabel="Leases →"
            />
            <PortalDashboardPreviewList
              items={pendingLeaseRows}
              href={`${BASE}/leases`}
              emptyMessage="No leases waiting for a signature."
              keyForItem={(lease) => lease.id}
              renderRow={(lease: LeasePipelineRow) => (
                <PortalDashboardCompactRow
                  title={lease.residentName || lease.residentEmail}
                  subtitle={formatCompactPlacementLine(lease.unit || "—", lease.signedRentLabel)}
                  badge={
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        lease.status === "Manager Signature Pending"
                          ? "bg-blue-100 text-blue-800"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {lease.status === "Manager Signature Pending" ? "Your signature" : "Resident signing"}
                    </span>
                  }
                />
              )}
            />
          </div>

          <div className={PORTAL_DASHBOARD_SECTION_CARD}>
            <PortalDashboardSectionHeader
              title="Pending & overdue payments"
              href={`${BASE}/payments`}
              linkLabel="Payments →"
              badge={
                overdueChargeCount > 0 ? (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold tabular-nums text-[var(--status-overdue-fg)]">
                    <span aria-hidden className="size-1.5 rounded-full bg-current" />
                    {overdueChargeCount} overdue
                  </span>
                ) : null
              }
            />
            <PortalDashboardPreviewList
              items={pendingCharges}
              href={`${BASE}/payments`}
              emptyMessage="No pending or overdue payments right now."
              keyForItem={(charge) => charge.id}
              renderRow={(charge) => {
                const overdue = isHouseholdChargeOverdue(charge);
                return (
                  <PortalDashboardCompactRow
                    title={charge.residentName || charge.residentEmail}
                    subtitle={formatCompactChargeLine(
                      charge.title || "Charge",
                      charge.balanceLabel,
                      chargeDueLabel(charge),
                    )}
                    badge={
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          overdue ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {overdue ? "Overdue" : "Pending"}
                      </span>
                    }
                  />
                );
              }}
            />
          </div>
        </div>

        {/* ── Services & inbox ── */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 [html[data-native]_&]:gap-2.5">
          <div className={PORTAL_DASHBOARD_SECTION_CARD}>
            <PortalDashboardSectionHeader
              title="Services"
              href={`${BASE}/services/requests`}
              linkLabel="Services →"
              badge={
                pendingServiceCount > 0 ? (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold tabular-nums text-[var(--status-pending-fg)]">
                    <span aria-hidden className="size-1.5 rounded-full bg-current" />
                    {pendingServiceCount} pending
                  </span>
                ) : null
              }
            />
            <PortalDashboardPreviewList
              items={serviceItems}
              href={`${BASE}/services/requests`}
              emptyMessage="No pending service requests or work orders."
              keyForItem={(item) => item.id}
              renderRow={(item) => (
                <PortalDashboardCompactRow
                  title={item.title}
                  subtitle={item.subtitle}
                  badge={
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                      Pending
                    </span>
                  }
                />
              )}
            />
          </div>

          <div className={PORTAL_DASHBOARD_SECTION_CARD}>
            <PortalDashboardSectionHeader
              title="Inbox"
              href={`${BASE}/inbox/unopened`}
              linkLabel="Inbox →"
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
        </div>
      </div>
    </ManagerPortalPageShell>
  );
}
