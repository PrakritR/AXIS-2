"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ManagerPortalPageShell,
  PortalDashboardCompactRow,
  PortalDashboardPreviewList,
  PortalDashboardSectionHeader,
  PortalDashboardTile,
  PORTAL_DASHBOARD_SECTION_CARD,
  PORTAL_DASHBOARD_STACK,
  formatCompactChargeLine,
} from "@/components/portal/portal-metrics";
import { RESIDENT_INBOX_THREAD_FALLBACK } from "@/components/portal/resident-inbox-panel";
import { usePortalSession } from "@/hooks/use-portal-session";
import {
  chargeDueLabel,
  HOUSEHOLD_CHARGES_EVENT,
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
  countUnopenedPersistedInbox,
  loadPersistedInbox,
  PORTAL_INBOX_CHANGED_EVENT,
  RESIDENT_INBOX_STORAGE_KEY,
  syncPersistedInboxFromServer,
} from "@/lib/portal-inbox-storage";

const BASE = "/resident";

type AppStatus = "pending" | "approved" | "rejected";

function dollars(cents: number) {
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

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
  showTestAccessNote = false,
  displayName = "Resident",
  residentEmail = "",
  residentUserId = null,
  managerSubscriptionTier = null,
}: {
  applicationApproved?: boolean;
  initialApplicationId?: string | null;
  showTestAccessNote?: boolean;
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
      syncPersistedInboxFromServer(RESIDENT_INBOX_STORAGE_KEY),
      syncHouseholdChargesFromServer(false, { skipReconcile: true }),
    ]).then(bump);
    window.addEventListener(LEASE_PIPELINE_EVENT, bump);
    window.addEventListener(MANAGER_WORK_ORDERS_EVENT, bump);
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
        openWO: 0,
        scheduledWO: 0,
        completedWO: 0,
        inbox: 0,
        inboxThreads: [] as ReturnType<typeof loadPersistedInbox>,
        pendingCharges: [] as ReturnType<typeof readChargesForResident>,
        pendingTotal: 0,
      };
    }

    const leaseRow = email ? findLeaseForResidentEmail(email) : null;
    const lease = leaseBadge(leaseRow, appStatus === "approved");

    const workOrders = email
      ? readManagerWorkOrderRows().filter((r) => r.residentEmail?.trim().toLowerCase() === email)
      : [];
    const openWO = workOrders.filter((r) => r.bucket === "open").length;
    const scheduledWO = workOrders.filter((r) => r.bucket === "scheduled").length;
    const completedWO = workOrders.filter((r) => r.bucket === "completed").length;

    const inboxThreads = loadPersistedInbox(RESIDENT_INBOX_STORAGE_KEY, RESIDENT_INBOX_THREAD_FALLBACK)
      .filter((t) => t.folder === "inbox" && t.unread)
      .slice(0, 5);
    const inbox = countUnopenedPersistedInbox(RESIDENT_INBOX_STORAGE_KEY, RESIDENT_INBOX_THREAD_FALLBACK);

    const charges = email ? readChargesForResident(email, residentUserId) : [];
    const pendingCharges = charges.filter((c) => c.status === "pending");
    const pendingTotal = pendingCharges.reduce((s, c) => {
      const n = Number(c.balanceLabel.replace(/[^\d.]/g, ""));
      return s + (Number.isFinite(n) ? Math.round(n * 100) : 0);
    }, 0);

    return { leaseRow, lease, openWO, scheduledWO, completedWO, inbox, inboxThreads, pendingCharges, pendingTotal };
  }, [tick, email, appStatus, residentUserId, clientReady]);

  const { leaseRow, lease, openWO, scheduledWO, completedWO, inbox, inboxThreads, pendingCharges, pendingTotal } = data;

  const welcomeTitle = `Welcome${displayName && displayName !== "Resident" ? `, ${displayName.split(" ")[0]}` : ""}`;
  const propertySubtitle =
    appProperty && appRoom ? `${appProperty} · ${appRoom}` : appProperty ?? undefined;

  let statusTone = "portal-banner-pending";
  let statusCopy = "Application submitted and pending manager review. Your portal will unlock after approval.";
  if (showTestAccessNote) {
    statusTone = "portal-banner-info";
    statusCopy = "Test access active — resident portal is fully unlocked for this email.";
  } else if (appStatus === "approved") {
    statusTone = "portal-banner-success";
    statusCopy = appProperty && appRoom
      ? `Approved for ${appProperty} - ${appRoom}.`
      : appProperty
      ? `Approved for ${appProperty}.`
      : "Approved and active.";
  } else if (appStatus === "rejected") {
    statusTone = "portal-banner-danger";
    statusCopy = "Your most recent application is marked rejected. Contact your manager if you need help or want to reapply.";
  }

  const moveInDateLabel = leaseRow?.application?.leaseStart?.trim() || null;

  return (
    <ManagerPortalPageShell title={welcomeTitle} subtitle={propertySubtitle} hideTitleOnNative>
      <div className={PORTAL_DASHBOARD_STACK}>

        <div className={`rounded-2xl border px-4 py-3 text-sm ${statusTone}`}>{statusCopy}</div>

        {appStatus === "approved" ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <PortalDashboardTile
                label="Outstanding balance"
                value={pendingCharges.length === 0 ? "$0.00" : dollars(pendingTotal)}
                sub={pendingCharges.length > 0 ? `${pendingCharges.length} pending charge${pendingCharges.length === 1 ? "" : "s"}` : "All caught up"}
                href={`${BASE}/payments`}
                urgent={pendingTotal > 0}
              />
              <PortalDashboardTile
                label="Open maintenance"
                value={canUseFullPortal ? openWO : "—"}
                sub={canUseFullPortal && scheduledWO > 0 ? `${scheduledWO} scheduled` : canUseFullPortal ? "No open requests" : "Available on upgraded plans"}
                href={`${BASE}/services/work-orders`}
                urgent={canUseFullPortal && openWO > 0}
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-2 [html[data-native]_&]:gap-2.5">
              <div className={PORTAL_DASHBOARD_SECTION_CARD}>
                <PortalDashboardSectionHeader title="Payments" href={`${BASE}/payments`} linkLabel="Payments →" />
                <PortalDashboardPreviewList
                  items={pendingCharges}
                  href={`${BASE}/payments`}
                  emptyMessage="No outstanding charges."
                  keyForItem={(charge) => charge.id}
                  renderRow={(charge) => (
                    <PortalDashboardCompactRow
                      title={charge.title || "Charge"}
                      subtitle={formatCompactChargeLine(charge.title || "Charge", charge.balanceLabel, chargeDueLabel(charge))}
                      badge={
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                          {charge.balanceLabel}
                        </span>
                      }
                    />
                  )}
                />
              </div>

              <div className={PORTAL_DASHBOARD_SECTION_CARD}>
                <PortalDashboardSectionHeader title="Lease" href={`${BASE}/lease`} linkLabel="Lease →" />
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <StatusBadge label={lease.label} tone={lease.tone} />
                  {leaseRow?.application?.leaseStart ? (
                    <span className="text-xs text-muted">
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
              <div className={PORTAL_DASHBOARD_SECTION_CARD}>
                <PortalDashboardSectionHeader title="Move-in" href={`${BASE}/move-in`} linkLabel="Move-in →" />
                {appProperty || appRoom || moveInDateLabel ? (
                  <ul className="mt-3 space-y-2">
                    {appProperty ? (
                      <li className="rounded-xl bg-accent/30 px-3 py-2.5">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">Property</p>
                        <p className="mt-0.5 text-sm font-semibold text-foreground">{appProperty}</p>
                        {appId ? <p className="mt-0.5 text-xs font-mono text-muted">{appId}</p> : null}
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

              <div className={PORTAL_DASHBOARD_SECTION_CARD}>
                <PortalDashboardSectionHeader
                  title="Services"
                  href={canUseFullPortal ? `${BASE}/services/work-orders` : `${BASE}/services`}
                  linkLabel="Services →"
                />
                {canUseFullPortal ? (
                  openWO + scheduledWO + completedWO === 0 ? (
                    <p className="mt-4 text-sm text-muted">No active maintenance requests.</p>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {openWO > 0 ? (
                        <li className="flex items-center justify-between rounded-xl bg-accent/30 px-3 py-2.5">
                          <span className="text-sm text-muted">Open</span>
                          <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-[10px] font-semibold text-rose-800">{openWO}</span>
                        </li>
                      ) : null}
                      {scheduledWO > 0 ? (
                        <li className="flex items-center justify-between rounded-xl bg-accent/30 px-3 py-2.5">
                          <span className="text-sm text-muted">Scheduled</span>
                          <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-[10px] font-semibold text-blue-800">{scheduledWO}</span>
                        </li>
                      ) : null}
                      {completedWO > 0 ? (
                        <li className="flex items-center justify-between rounded-xl bg-accent/30 px-3 py-2.5">
                          <span className="text-sm text-muted">Completed</span>
                          <span className="text-sm font-semibold text-muted">{completedWO}</span>
                        </li>
                      ) : null}
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
            <div className={PORTAL_DASHBOARD_SECTION_CARD}>
              <PortalDashboardSectionHeader title="Application" />
              <p className="mt-4 text-sm font-semibold text-foreground">{appStage}</p>
              {appId ? <p className="mt-0.5 text-xs font-mono text-muted">{appId}</p> : null}
              {appProperty ? <p className="mt-1 text-xs text-muted">{appProperty}</p> : null}
            </div>
            <div className={PORTAL_DASHBOARD_SECTION_CARD}>
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
