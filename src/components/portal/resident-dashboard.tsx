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
  void managerSubscriptionTier;
  const initialEmail = residentEmail.trim().toLowerCase();
  const session = usePortalSession({ userId: residentUserId, email: initialEmail || null });
  const email = session.email?.trim().toLowerCase() || initialEmail;
  const canUseFullPortal = applicationApproved;

  const [appStatus, setAppStatus] = useState<AppStatus>(applicationApproved ? "approved" : "pending");
  const [appStage, setAppStage] = useState(applicationApproved ? "Approved" : "Submitted");
  const [appProperty, setAppProperty] = useState<string | null>(null);
  const [appRoom, setAppRoom] = useState<string | null>(null);
  const [appId, setAppId] = useState<string | null>(initialApplicationId);

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
        setAppStage(row.stage?.trim() || finalBucket);
        setAppProperty(resolvedProperty);
        setAppRoom(resolvedRoom);
        setAppId(row.id?.trim() || null);
      } else {
        setAppStatus(applicationApproved ? "approved" : "pending");
        setAppStage(applicationApproved ? "Approved" : "Submitted");
        setAppProperty(null);
        setAppRoom(null);
        setAppId(initialApplicationId);
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
  }, [applicationApproved, email, initialApplicationId]);

  const data = useMemo(() => {
    void tick;
    if (!clientReady) {
      return {
        leaseRow: null,
        lease: leaseBadge(null, appStatus === "approved"),
        pendingRequests: 0,
        pendingWorkOrders: 0,
        inbox: 0,
        inboxThreads: [] as ReturnType<typeof loadPersistedInbox>,
        pendingCharges: [] as ReturnType<typeof readChargesForResident>,
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
    const pendingWorkOrders = workOrders.filter((r) => r.bucket === "open").length;

    const serviceRequests = email ? readServiceRequestsForResident(email) : [];
    const pendingRequests = serviceRequests.filter((r) => r.status === "pending").length;

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
    return { leaseRow, lease, pendingRequests, pendingWorkOrders, inbox, inboxThreads, pendingCharges };
  }, [tick, email, appStatus, residentUserId, clientReady]);

  const { leaseRow, lease, pendingRequests, pendingWorkOrders, inbox, inboxThreads, pendingCharges } = data;

  const welcomeName =
    displayName && displayName !== "Resident" ? displayName.split(/\s+/)[0] : null;

  const moveInDateLabel = leaseRow?.application?.leaseStart?.trim() || null;
  const overdueChargeCount = pendingCharges.filter((c) => isHouseholdChargeOverdue(c)).length;

  return (
    <ManagerPortalPageShell
      title="Dashboard"
      subtitle={portalDashboardWelcomeSubtitle(welcomeName)}
      hideTitleOnNative
    >
      <div className={PORTAL_DASHBOARD_STACK}>
        {appStatus === "approved" ? (
          <>
            <div className="grid gap-4 lg:grid-cols-2 [html[data-native]_&]:gap-2.5">
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
                <PortalDashboardSectionHeader title="Lease" href={`${BASE}/lease`} linkLabel="Lease →" />
                <div className="mt-4 flex flex-col items-start gap-2 [html[data-native]_&]:mt-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
                  <StatusBadge label={lease.label} tone={lease.tone} />
                  {leaseRow?.application?.leaseStart ? (
                    <span className="text-xs leading-snug text-muted [html[data-native]_&]:text-[11px]">
                      {leaseRow.application.leaseStart}
                      {leaseRow.application.leaseEnd ? ` → ${leaseRow.application.leaseEnd}` : ""}
                    </span>
                  ) : (
                    <span className="text-sm text-muted">No lease dates on file yet.</span>
                  )}
                </div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className={`${PORTAL_DASHBOARD_SECTION_CARD} min-w-0`}>
                <PortalDashboardSectionHeader title="Move-in" href={`${BASE}/move-in`} linkLabel="Move-in →" />
                {appProperty || appRoom || moveInDateLabel ? (
                  <ul className="mt-3 space-y-2">
                    {appProperty ? (
                      <li className="rounded-xl bg-accent/30 px-3 py-2.5">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">Property</p>
                        <p className="mt-0.5 break-words text-sm font-semibold text-foreground">{appProperty}</p>
                      </li>
                    ) : null}
                    {appRoom ? (
                      <li className="rounded-xl bg-accent/30 px-3 py-2.5">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">Room</p>
                        <p className="mt-0.5 text-sm font-semibold text-foreground">{appRoom}</p>
                      </li>
                    ) : null}
                    {moveInDateLabel ? (
                      <li className="rounded-xl bg-accent/30 px-3 py-2.5">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">Lease start</p>
                        <p className="mt-0.5 text-sm font-semibold text-foreground">{moveInDateLabel}</p>
                      </li>
                    ) : null}
                  </ul>
                ) : (
                  <p className="mt-4 text-sm text-muted">Move-in details will appear once your placement is assigned.</p>
                )}
              </div>

              <div className={`${PORTAL_DASHBOARD_SECTION_CARD} min-w-0`}>
                <PortalDashboardSectionHeader
                  title="Services"
                  href={canUseFullPortal ? `${BASE}/services/requests` : `${BASE}/services`}
                  linkLabel="Services →"
                />
                {canUseFullPortal ? (
                  pendingRequests + pendingWorkOrders === 0 ? (
                    <p className="mt-4 text-sm text-muted">No pending service requests or work orders.</p>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      <li className="flex items-center justify-between rounded-xl bg-accent/30 px-3 py-2.5">
                        <span className="text-sm text-muted">Requests</span>
                        {pendingRequests > 0 ? (
                          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-semibold text-amber-800">
                            {pendingRequests}
                          </span>
                        ) : (
                          <span className="text-sm font-semibold text-muted">0</span>
                        )}
                      </li>
                      <li className="flex items-center justify-between rounded-xl bg-accent/30 px-3 py-2.5">
                        <span className="text-sm text-muted">Work orders</span>
                        {pendingWorkOrders > 0 ? (
                          <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-[10px] font-semibold text-rose-800">
                            {pendingWorkOrders}
                          </span>
                        ) : (
                          <span className="text-sm font-semibold text-muted">0</span>
                        )}
                      </li>
                    </ul>
                  )
                ) : (
                  <p className="mt-4 text-sm text-muted">Available on upgraded property plans.</p>
                )}
              </div>
            </div>

            <div className={PORTAL_DASHBOARD_SECTION_CARD}>
              <PortalDashboardSectionHeader title="Inbox" href={`${BASE}/inbox/unopened`} linkLabel="Inbox →" />
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
          </>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className={`${PORTAL_DASHBOARD_SECTION_CARD} min-w-0`}>
              <PortalDashboardSectionHeader title="Application" />
              <p className="mt-4 text-sm font-semibold text-foreground">{appStage}</p>
              {appId ? <p className="mt-0.5 break-all text-xs font-mono text-muted">{appId}</p> : null}
              {appProperty ? <p className="mt-1 break-words text-xs text-muted">{appProperty}</p> : null}
            </div>
            <div className={`${PORTAL_DASHBOARD_SECTION_CARD} min-w-0`}>
              <PortalDashboardSectionHeader title="Inbox" href={`${BASE}/inbox/unopened`} linkLabel="Inbox →" />
              {inbox > 0 ? (
                <p className="mt-4 text-sm font-semibold text-foreground">{inbox} unread message{inbox === 1 ? "" : "s"}</p>
              ) : (
                <p className="mt-4 text-sm text-muted">No unread messages.</p>
              )}
            </div>
          </div>
        )}

      </div>
    </ManagerPortalPageShell>
  );
}
