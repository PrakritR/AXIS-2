"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ManagerPortalPageShell,
  portalDashboardWelcomeSubtitle,
  PortalDashboardCompactRow,
  PortalDashboardPreviewList,
  PortalDashboardSectionHeader,
  PORTAL_DASHBOARD_SECTION_CARD,
  PORTAL_DASHBOARD_STACK,
  formatCompactChargeLine,
} from "@/components/portal/portal-metrics";
import { RESIDENT_INBOX_THREAD_FALLBACK } from "@/components/portal/resident-inbox-panel";
import { usePortalSession } from "@/hooks/use-portal-session";
import {
  chargeDueLabel,
  HOUSEHOLD_CHARGES_EVENT,
  isHouseholdChargeOverdue,
  readChargesForResident,
  syncHouseholdChargesFromServer,
} from "@/lib/household-charges";
import {
  LEASE_PIPELINE_EVENT,
  findLeaseForResidentEmail,
  residentCanViewLeaseRow,
  syncLeasePipelineFromServer,
  type LeasePipelineRow,
} from "@/lib/lease-pipeline-storage";
import {
  MANAGER_APPLICATIONS_EVENT,
  readManagerApplicationRows,
  syncManagerApplicationsFromServer,
} from "@/lib/manager-applications-storage";
import { getPropertyById, getRoomChoiceLabel } from "@/lib/rental-application/data";
import { applicationsForResidentEmail } from "@/lib/rental-application/application-policy";
import {
  MANAGER_WORK_ORDERS_EVENT,
  readManagerWorkOrderRows,
  syncManagerWorkOrdersFromServer,
} from "@/lib/manager-work-orders-storage";
import {
  readServiceRequestsForResident,
  SERVICE_REQUESTS_EVENT,
  syncServiceRequestsFromServer,
} from "@/lib/service-requests-storage";
import type { DemoApplicantRow, DemoManagerWorkOrderRow } from "@/data/demo-portal";
import type { ServiceRequest } from "@/lib/service-requests-storage";
import {
  countUnopenedPersistedInbox,
  loadPersistedInbox,
  PORTAL_INBOX_CHANGED_EVENT,
  RESIDENT_INBOX_STORAGE_KEY,
  syncPersistedInboxFromServer,
} from "@/lib/portal-inbox-storage";

const BASE = "/resident";

type AppStatus = "pending" | "approved" | "rejected";

function leaseBadge(row: LeasePipelineRow | null, approved: boolean): {
  label: string;
  tone: "emerald" | "amber" | "sky" | "slate" | "blue";
  cta: boolean;
} {
  if (!approved || !row) return { label: "Not started", tone: "slate", cta: false };
  if (!residentCanViewLeaseRow(row)) {
    if (row.status === "Voided") return { label: "Voided", tone: "slate", cta: false };
    return { label: "Being prepared", tone: "slate", cta: false };
  }
  switch (row.status) {
    case "Fully Signed": return { label: "Active ✓", tone: "emerald", cta: false };
    case "Resident Signature Pending": return { label: "Sign now", tone: "blue", cta: true };
    case "Manager Signature Pending": return { label: "Awaiting manager", tone: "sky", cta: false };
    default: return { label: row.status || "In progress", tone: "amber", cta: false };
  }
}

function StatusBadge({ label, tone }: { label: string; tone: string }) {
  const cls: Record<string, string> = {
    emerald: "portal-badge-success",
    amber: "portal-badge-pending",
    sky: "portal-badge-info",
    blue: "portal-badge-info",
    slate: "bg-accent/30 text-muted",
    rose: "portal-badge-danger",
  };
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${cls[tone] ?? cls.slate}`}>
      {label}
    </span>
  );
}

function applicationStatusBadge(row: DemoApplicantRow): { label: string; tone: "emerald" | "amber" | "rose" | "slate" } {
  if (row.bucket === "approved") return { label: "Approved", tone: "emerald" };
  if (row.bucket === "rejected") return { label: "Rejected", tone: "rose" };
  return { label: row.stage?.trim() || "Pending", tone: "amber" };
}

function applicationSubtitle(row: DemoApplicantRow): string {
  const property = row.property?.trim() || row.application?.propertyId?.trim() || "";
  const stage = row.stage?.trim();
  if (property && stage) return `${property} · ${stage}`;
  return property || stage || "Application";
}

type ServicePreviewItem =
  | { kind: "request"; id: string; row: ServiceRequest }
  | { kind: "work-order"; id: string; row: DemoManagerWorkOrderRow };

function servicePreviewItems(
  requests: ServiceRequest[],
  workOrders: DemoManagerWorkOrderRow[],
): ServicePreviewItem[] {
  const items: ServicePreviewItem[] = [];
  for (const row of requests.filter((r) => r.status === "pending" || r.status === "approved")) {
    items.push({ kind: "request", id: `req-${row.id}`, row });
  }
  for (const row of workOrders.filter((r) => r.bucket === "open" || r.bucket === "scheduled")) {
    items.push({ kind: "work-order", id: `wo-${row.id}`, row });
  }
  return items;
}

export function ResidentDashboard({
  applicationApproved = false,
  initialApplicationId = null,
  displayName = "Resident",
  residentEmail = "",
  residentUserId = null,
  managerSubscriptionTier = null,
}: {
  applicationApproved?: boolean;
  initialApplicationId?: string | null;
  displayName?: string;
  residentEmail?: string;
  residentUserId?: string | null;
  managerSubscriptionTier?: "free" | "paid" | null;
}) {
  void initialApplicationId;
  void managerSubscriptionTier;
  const initialEmail = residentEmail.trim().toLowerCase();
  const session = usePortalSession({ userId: residentUserId, email: initialEmail || null });
  const email = session.email?.trim().toLowerCase() || initialEmail;
  const canUseFullPortal = applicationApproved;

  const [appStatus, setAppStatus] = useState<AppStatus>(applicationApproved ? "approved" : "pending");
  const [appProperty, setAppProperty] = useState<string | null>(null);
  const [appRoom, setAppRoom] = useState<string | null>(null);

  const [tick, setTick] = useState(0);
  const bump = () => setTick((n) => n + 1);
  const [clientReady, setClientReady] = useState(false);

  useEffect(() => {
    queueMicrotask(() => setClientReady(true));
  }, []);

  useEffect(() => {
    void Promise.allSettled([
      syncManagerApplicationsFromServer({ force: true }),
      syncLeasePipelineFromServer(),
      syncManagerWorkOrdersFromServer(),
      syncServiceRequestsFromServer({ force: true }),
      syncPersistedInboxFromServer(RESIDENT_INBOX_STORAGE_KEY),
      syncHouseholdChargesFromServer(false, { skipReconcile: true }),
    ]).then(bump);
    window.addEventListener(LEASE_PIPELINE_EVENT, bump);
    window.addEventListener(MANAGER_WORK_ORDERS_EVENT, bump);
    window.addEventListener(SERVICE_REQUESTS_EVENT, bump);
    window.addEventListener(HOUSEHOLD_CHARGES_EVENT, bump);
    window.addEventListener("storage", bump);
    const onInbox = (e: Event) => {
      const key = (e as CustomEvent<{ key?: string }>).detail?.key;
      if (!key || key === RESIDENT_INBOX_STORAGE_KEY) bump();
    };
    window.addEventListener(PORTAL_INBOX_CHANGED_EVENT, onInbox as EventListener);
    return () => {
      window.removeEventListener(LEASE_PIPELINE_EVENT, bump);
      window.removeEventListener(MANAGER_WORK_ORDERS_EVENT, bump);
      window.removeEventListener(SERVICE_REQUESTS_EVENT, bump);
      window.removeEventListener(HOUSEHOLD_CHARGES_EVENT, bump);
      window.removeEventListener("storage", bump);
      window.removeEventListener(PORTAL_INBOX_CHANGED_EVENT, onInbox as EventListener);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const apply = () => {
      const rows = readManagerApplicationRows();
      const row = email ? rows.find((r) => r.email?.trim().toLowerCase() === email) : undefined;
      if (!alive) return;
      if (row?.bucket === "approved" || row?.bucket === "rejected" || row?.bucket === "pending") {
        const resolvedProperty = (() => {
          const assignedPropertyId = row.assignedPropertyId?.trim() || row.propertyId?.trim() || row.application?.propertyId?.trim();
          if (assignedPropertyId) {
            const p = getPropertyById(assignedPropertyId);
            if (p) {
              const street = p.address.split(",")[0]?.trim();
              return street || p.buildingName || p.title || null;
            }
          }
          const fallback = row.property?.trim() || null;
          if (!fallback) return null;
          return fallback.split("·")[0]?.trim() || fallback;
        })();

        const resolvedRoom = (() => {
          const roomChoice = row.assignedRoomChoice?.trim() || row.application?.roomChoice1?.trim() || "";
          if (!roomChoice) return null;
          const roomLabel = getRoomChoiceLabel(roomChoice).trim();
          if (!roomLabel) return null;
          return roomLabel.split(" · ")[0]?.trim() || roomLabel;
        })();

        const finalBucket = applicationApproved && row.bucket === "pending" ? "approved" : row.bucket;
        setAppStatus(finalBucket);
        setAppProperty(resolvedProperty);
        setAppRoom(resolvedRoom);
      } else {
        setAppStatus("pending");
        setAppProperty(null);
        setAppRoom(null);
      }
    };
    apply();
    void syncManagerApplicationsFromServer({ force: true }).then(() => { if (alive) apply(); });
    window.addEventListener(MANAGER_APPLICATIONS_EVENT, apply);
    window.addEventListener("storage", apply);
    return () => {
      alive = false;
      window.removeEventListener(MANAGER_APPLICATIONS_EVENT, apply);
      window.removeEventListener("storage", apply);
    };
  }, [applicationApproved, email]);

  const data = useMemo(() => {
    void tick;
    if (!clientReady) {
      return {
        leaseRow: null,
        lease: leaseBadge(null, appStatus === "approved"),
        inbox: 0,
        inboxThreads: [] as ReturnType<typeof loadPersistedInbox>,
        pendingCharges: [] as ReturnType<typeof readChargesForResident>,
        applicationRows: [] as ReturnType<typeof applicationsForResidentEmail>,
        workOrders: [] as DemoManagerWorkOrderRow[],
        serviceRequests: [] as ServiceRequest[],
        serviceItems: [] as ServicePreviewItem[],
        openWorkOrderCount: 0,
        scheduledWorkOrderCount: 0,
        pendingRequestCount: 0,
        approvedRequestCount: 0,
      };
    }

    const leaseRow = email ? findLeaseForResidentEmail(email) : null;
    const lease = leaseBadge(leaseRow, appStatus === "approved");

    const workOrders = email
      ? readManagerWorkOrderRows().filter(
          (r) =>
            r.residentEmail?.trim().toLowerCase() === email &&
            (r as { requestType?: string }).requestType !== "service",
        )
      : [];
    const openWorkOrderCount = workOrders.filter((r) => r.bucket === "open").length;
    const scheduledWorkOrderCount = workOrders.filter((r) => r.bucket === "scheduled").length;

    const serviceRequests = email ? readServiceRequestsForResident(email) : [];
    const pendingRequestCount = serviceRequests.filter((r) => r.status === "pending").length;
    const approvedRequestCount = serviceRequests.filter((r) => r.status === "approved").length;
    const serviceItems = servicePreviewItems(serviceRequests, workOrders);

    const inboxThreads = loadPersistedInbox(RESIDENT_INBOX_STORAGE_KEY, RESIDENT_INBOX_THREAD_FALLBACK)
      .filter((t) => t.folder === "inbox" && t.unread)
      .slice(0, 5);
    const inbox = countUnopenedPersistedInbox(RESIDENT_INBOX_STORAGE_KEY, RESIDENT_INBOX_THREAD_FALLBACK);

    const charges = email ? readChargesForResident(email, residentUserId) : [];
    const pendingCharges = charges
      .filter((c) => c.status === "pending")
      .sort((a, b) => {
        const aOverdue = isHouseholdChargeOverdue(a);
        const bOverdue = isHouseholdChargeOverdue(b);
        if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
        return 0;
      });
    return {
      leaseRow,
      lease,
      inbox,
      inboxThreads,
      pendingCharges,
      applicationRows: email ? applicationsForResidentEmail(email) : [],
      workOrders,
      serviceRequests,
      serviceItems,
      openWorkOrderCount,
      scheduledWorkOrderCount,
      pendingRequestCount,
      approvedRequestCount,
    };
  }, [tick, email, appStatus, residentUserId, clientReady]);

  const {
    leaseRow,
    lease,
    inbox,
    inboxThreads,
    pendingCharges,
    applicationRows,
    serviceItems,
    openWorkOrderCount,
    scheduledWorkOrderCount,
    pendingRequestCount,
    approvedRequestCount,
  } = data;
  const pendingApplicationCount = applicationRows.filter((r) => r.bucket === "pending").length;
  const approvedApplicationCount = applicationRows.filter((r) => r.bucket === "approved").length;

  const welcomeName =
    displayName && displayName !== "Resident" ? displayName.split(/\s+/)[0] : null;

  const overdueChargeCount = pendingCharges.filter((c) => isHouseholdChargeOverdue(c)).length;

  return (
    <ManagerPortalPageShell
      title="Dashboard"
      subtitle={portalDashboardWelcomeSubtitle(welcomeName)}
      hideTitleOnNative
    >
      <div className={PORTAL_DASHBOARD_STACK}>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 [html[data-native]_&]:gap-2.5">
          <div className={`${PORTAL_DASHBOARD_SECTION_CARD} min-w-0`}>
            <PortalDashboardSectionHeader
              title="Applications"
              href={`${BASE}/applications`}
              linkLabel="Applications →"
              badge={
                pendingApplicationCount > 0 || approvedApplicationCount > 0 ? (
                  <span className="flex flex-wrap items-center gap-1.5">
                    {pendingApplicationCount > 0 ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                        {pendingApplicationCount} pending
                      </span>
                    ) : null}
                    {approvedApplicationCount > 0 ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                        {approvedApplicationCount} approved
                      </span>
                    ) : null}
                  </span>
                ) : null
              }
            />
            <PortalDashboardPreviewList
              items={applicationRows}
              href={`${BASE}/applications`}
              emptyMessage="No applications yet. Start your first application."
              keyForItem={(row) => row.id}
              renderRow={(row) => {
                const badge = applicationStatusBadge(row);
                return (
                  <PortalDashboardCompactRow
                    title={row.name?.trim() || "Application"}
                    subtitle={applicationSubtitle(row)}
                    badge={
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          badge.tone === "emerald"
                            ? "bg-emerald-100 text-emerald-800"
                            : badge.tone === "rose"
                              ? "bg-rose-100 text-rose-800"
                              : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {badge.label}
                      </span>
                    }
                    stackBadge
                  />
                );
              }}
            />
          </div>

          <div className={`${PORTAL_DASHBOARD_SECTION_CARD} min-w-0`}>
            <PortalDashboardSectionHeader title="Lease" href={`${BASE}/lease`} linkLabel="Lease →" />
            <div className="mt-4 flex flex-col items-start gap-2 [html[data-native]_&]:mt-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
              <StatusBadge label={lease.label} tone={lease.tone} />
              {leaseRow?.application?.leaseStart ? (
                <span className="text-xs leading-snug text-muted [html[data-native]_&]:text-[11px]">
                  {leaseRow.application.leaseStart}
                  {leaseRow.application.leaseEnd ? ` → ${leaseRow.application.leaseEnd}` : ""}
                </span>
              ) : appProperty ? (
                <span className="text-sm text-muted">{appProperty}{appRoom ? ` · ${appRoom}` : ""}</span>
              ) : (
                <span className="text-sm text-muted">No lease on file yet.</span>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 [html[data-native]_&]:gap-2.5">
          <div className={`${PORTAL_DASHBOARD_SECTION_CARD} min-w-0`}>
            <PortalDashboardSectionHeader
              title="Payments"
              href={`${BASE}/payments`}
              linkLabel="Payments →"
              badge={
                overdueChargeCount > 0 ? (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold tabular-nums text-[var(--status-overdue-fg)]">
                    <span aria-hidden className="size-1.5 rounded-full bg-current" />
                    {overdueChargeCount} overdue
                  </span>
                ) : pendingCharges.length > 0 ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                    {pendingCharges.length} pending
                  </span>
                ) : null
              }
            />
            <PortalDashboardPreviewList
              items={pendingCharges}
              href={`${BASE}/payments`}
              emptyMessage="No outstanding charges."
              keyForItem={(charge) => charge.id}
              renderRow={(charge) => {
                const overdue = isHouseholdChargeOverdue(charge);
                return (
                  <PortalDashboardCompactRow
                    title={charge.title || "Charge"}
                    subtitle={formatCompactChargeLine(
                      charge.title || "Charge",
                      charge.balanceLabel,
                      chargeDueLabel(charge),
                      { omitBalance: true },
                    )}
                    badge={
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums ${
                          overdue ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {overdue ? `${charge.balanceLabel} · Overdue` : charge.balanceLabel}
                      </span>
                    }
                    stackBadge
                  />
                );
              }}
            />
          </div>

          <div className={`${PORTAL_DASHBOARD_SECTION_CARD} min-w-0`}>
            <PortalDashboardSectionHeader
              title="Services"
              href={canUseFullPortal ? `${BASE}/services/requests` : `${BASE}/services`}
              linkLabel="Services →"
              badge={
                canUseFullPortal &&
                (openWorkOrderCount > 0 ||
                  scheduledWorkOrderCount > 0 ||
                  pendingRequestCount > 0 ||
                  approvedRequestCount > 0) ? (
                  <span className="flex flex-wrap items-center gap-1.5">
                    {openWorkOrderCount > 0 ? (
                      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-800">
                        {openWorkOrderCount} open
                      </span>
                    ) : null}
                    {scheduledWorkOrderCount > 0 ? (
                      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-800">
                        {scheduledWorkOrderCount} scheduled
                      </span>
                    ) : null}
                    {pendingRequestCount > 0 ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                        {pendingRequestCount} request{pendingRequestCount === 1 ? "" : "s"}
                      </span>
                    ) : null}
                  </span>
                ) : null
              }
            />
            {canUseFullPortal ? (
              <PortalDashboardPreviewList
                items={serviceItems}
                href={`${BASE}/services/work-orders`}
                emptyMessage="No open work orders or pending requests."
                keyForItem={(item) => item.id}
                renderRow={(item) => {
                  if (item.kind === "request") {
                    const status = item.row.status;
                    const label = status === "approved" ? "Approved" : "Pending";
                    const tone =
                      status === "approved" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800";
                    const propertyName = getPropertyById(item.row.propertyId)?.buildingName?.trim() || "";
                    return (
                      <PortalDashboardCompactRow
                        title={item.row.offerName?.trim() || "Service request"}
                        subtitle={propertyName || "Request"}
                        badge={
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${tone}`}>{label}</span>
                        }
                        stackBadge
                      />
                    );
                  }
                  const bucketLabel = item.row.bucket === "scheduled" ? "Scheduled" : "Open";
                  const bucketTone =
                    item.row.bucket === "scheduled"
                      ? "bg-sky-100 text-sky-800"
                      : "bg-rose-100 text-rose-800";
                  return (
                    <PortalDashboardCompactRow
                      title={item.row.title?.trim() || "Work order"}
                      subtitle={[item.row.propertyName, item.row.unit].filter(Boolean).join(" · ") || "Maintenance"}
                      badge={
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${bucketTone}`}>
                          {bucketLabel}
                        </span>
                      }
                      stackBadge
                    />
                  );
                }}
              />
            ) : (
              <p className="mt-4 text-sm text-muted">Available after your application is approved.</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 [html[data-native]_&]:gap-2.5">
          <div className={`${PORTAL_DASHBOARD_SECTION_CARD} min-w-0 lg:col-span-2`}>
            <PortalDashboardSectionHeader
              title="Inbox"
              href={`${BASE}/inbox/unopened`}
              linkLabel="Inbox →"
              badge={
                inbox > 0 ? (
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-800">
                    {inbox} unread
                  </span>
                ) : null
              }
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
