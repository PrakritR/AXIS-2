"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ManagerPortalPageShell } from "@/components/portal/portal-metrics";
import { RESIDENT_INBOX_THREAD_FALLBACK } from "@/components/portal/resident-inbox-panel";
import { usePortalSession } from "@/hooks/use-portal-session";
import {
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
  PORTAL_INBOX_CHANGED_EVENT,
  RESIDENT_INBOX_STORAGE_KEY,
  syncPersistedInboxFromServer,
} from "@/lib/portal-inbox-storage";

const BASE = "/resident";

type AppStatus = "pending" | "approved" | "rejected";

function leaseBadge(row: LeasePipelineRow | null, approved: boolean): {
  label: string;
  tone: "confirmed" | "pending" | "approved" | "neutral" | "overdue";
  cta: boolean;
} {
  if (!approved || !row) return { label: "Not started", tone: "neutral", cta: false };
  if (!residentCanViewLeaseRow(row)) {
    if (row.status === "Voided") return { label: "Voided", tone: "neutral", cta: false };
    return { label: "Being prepared", tone: "neutral", cta: false };
  }
  switch (row.status) {
    case "Fully Signed": return { label: "Active ✓", tone: "confirmed", cta: false };
    case "Resident Signature Pending": return { label: "Sign now", tone: "approved", cta: true };
    case "Manager Signature Pending": return { label: "Awaiting manager", tone: "approved", cta: false };
    default: return { label: row.status || "In progress", tone: "pending", cta: false };
  }
}

function StatusBadge({ label, tone }: { label: string; tone: "pending" | "approved" | "confirmed" | "overdue" | "neutral" }) {
  return <Badge tone={tone}>{label}</Badge>;
}

function NotifBanner({
  tone,
  children,
}: {
  tone: "pending" | "approved" | "confirmed" | "overdue";
  children: React.ReactNode;
}) {
  const cls = {
    pending:
      "border-[color-mix(in_srgb,var(--status-pending-fg)_28%,transparent)] bg-[var(--status-pending-bg)] text-[var(--status-pending-fg)]",
    approved:
      "border-[color-mix(in_srgb,var(--status-approved-fg)_28%,transparent)] bg-[var(--status-approved-bg)] text-[var(--status-approved-fg)]",
    confirmed:
      "border-[color-mix(in_srgb,var(--status-confirmed-fg)_28%,transparent)] bg-[var(--status-confirmed-bg)] text-[var(--status-confirmed-fg)]",
    overdue:
      "border-[color-mix(in_srgb,var(--status-overdue-fg)_28%,transparent)] bg-[var(--status-overdue-bg)] text-[var(--status-overdue-fg)]",
  }[tone];
  return (
    <div className={`glass-card flex items-start justify-between gap-3 rounded-2xl px-4 py-3.5 text-sm backdrop-blur-xl ${cls}`}>
      {children}
    </div>
  );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass-card min-h-[9.5rem] rounded-2xl p-6 transition-[border-color,box-shadow,transform] duration-200 hover:border-primary/25 hover:shadow-[var(--shadow-card-hover)]">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">{title}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function residentInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  return (parts[0]?.slice(0, 2) ?? "R").toUpperCase();
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
  const initialEmail = residentEmail.trim().toLowerCase();
  const session = usePortalSession({ userId: residentUserId, email: initialEmail || null });
  const email = session.email?.trim().toLowerCase() || initialEmail;
  const managerIsFree = managerSubscriptionTier === "free";
  const canUseFullPortal = applicationApproved && !managerIsFree;

  const [appStatus, setAppStatus] = useState<AppStatus>(applicationApproved ? "approved" : "pending");
  const [appStage, setAppStage] = useState(applicationApproved ? "Approved" : "Submitted");
  const [appProperty, setAppProperty] = useState<string | null>(null);
  const [appRoom, setAppRoom] = useState<string | null>(null);
  const [appId, setAppId] = useState<string | null>(initialApplicationId);

  const [tick, setTick] = useState(0);
  const bump = () => setTick((n) => n + 1);

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

        // Use row's bucket, but prefer server-determined approval status if it's more permissive
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
    const leaseRow = email ? findLeaseForResidentEmail(email) : null;
    const lease = leaseBadge(leaseRow, appStatus === "approved");

    const workOrders = email
      ? readManagerWorkOrderRows().filter((r) => r.residentEmail?.trim().toLowerCase() === email)
      : [];
    const openWO = workOrders.filter((r) => r.bucket === "open").length;
    const scheduledWO = workOrders.filter((r) => r.bucket === "scheduled").length;
    const completedWO = workOrders.filter((r) => r.bucket === "completed").length;

    const inbox = countUnopenedPersistedInbox(RESIDENT_INBOX_STORAGE_KEY, RESIDENT_INBOX_THREAD_FALLBACK);

    const charges = email ? readChargesForResident(email, residentUserId) : [];
    const pendingCharges = charges.filter((c) => c.status === "pending");
    const pendingTotal = pendingCharges.reduce((s, c) => {
      const n = Number(c.balanceLabel.replace(/[^\d.]/g, ""));
      return s + (Number.isFinite(n) ? Math.round(n * 100) : 0);
    }, 0);

    return { leaseRow, lease, openWO, scheduledWO, completedWO, inbox, pendingCharges, pendingTotal };
  }, [tick, email, appStatus, residentUserId]);

  const { leaseRow, lease, openWO, scheduledWO, completedWO, inbox, pendingCharges, pendingTotal } = data;

  // ── Status banner copy ──
  let statusTone: "pending" | "approved" | "confirmed" | "overdue" = "pending";
  let statusCopy = "Application submitted and pending manager review. Your portal will unlock after approval.";
  if (showTestAccessNote) {
    statusTone = "approved";
    statusCopy = "Test access active — resident portal is fully unlocked for this email.";
  } else if (appStatus === "approved") {
    statusTone = "confirmed";
    statusCopy = appProperty && appRoom
      ? `Approved for ${appProperty} · ${appRoom}.${managerIsFree ? " Lease and work orders require an upgraded property plan." : ""}`
      : appProperty
      ? `Approved for ${appProperty}.${managerIsFree ? " Lease and work orders require an upgraded property plan." : ""}`
      : `Approved and active.${managerIsFree ? " Lease and work orders require an upgraded property plan." : ""}`;
  } else if (appStatus === "rejected") {
    statusTone = "overdue";
    statusCopy = "Your most recent application is marked rejected. Contact your manager if you need help or want to reapply.";
  }

  const firstName = displayName && displayName !== "Resident" ? displayName.split(" ")[0] : null;
  const propertySubline = [appProperty, appRoom].filter(Boolean).join(" · ");
  const statusBannerCls = {
    pending:
      "border-[color-mix(in_srgb,var(--status-pending-fg)_28%,transparent)] bg-[var(--status-pending-bg)] text-[var(--status-pending-fg)]",
    approved:
      "border-[color-mix(in_srgb,var(--status-approved-fg)_28%,transparent)] bg-[var(--status-approved-bg)] text-[var(--status-approved-fg)]",
    confirmed:
      "border-[color-mix(in_srgb,var(--status-confirmed-fg)_28%,transparent)] bg-[var(--status-confirmed-bg)] text-[var(--status-confirmed-fg)]",
    overdue:
      "border-[color-mix(in_srgb,var(--status-overdue-fg)_28%,transparent)] bg-[var(--status-overdue-bg)] text-[var(--status-overdue-fg)]",
  }[statusTone];

  return (
    <ManagerPortalPageShell
      title={firstName ? `Welcome, ${firstName}` : "Welcome"}
      titleAside={
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white shadow-[0_8px_20px_-8px_rgba(47,107,255,0.55)]"
          style={{ background: "linear-gradient(135deg, var(--cobalt-deep) 0%, var(--sky) 100%)" }}
          aria-hidden
        >
          {residentInitials(displayName)}
        </div>
      }
      filterRow={
        propertySubline ? (
          <p className="text-sm text-muted">{propertySubline}</p>
        ) : undefined
      }
    >
      <div className="space-y-5">

        {/* ── Application status notice ── */}
        <div className={`glass-card rounded-2xl px-4 py-3.5 text-sm backdrop-blur-xl ${statusBannerCls}`}>
          {statusCopy}
        </div>

        {managerIsFree && appStatus === "approved" ? (
          <div className="glass-card rounded-2xl border border-border px-4 py-3.5 text-sm text-muted backdrop-blur-xl">
            <p className="font-medium text-foreground">Some features are awaiting your property manager</p>
            <p className="mt-1 leading-relaxed">
              Lease signing, maintenance, and related tools become available when your property team upgrades from the Free plan. There is nothing you need to do on your end.
            </p>
          </div>
        ) : null}

        {/* ── Action-required banners (only when actionable) ── */}
        {(lease.cta || pendingCharges.length > 0 || inbox > 0 || (canUseFullPortal && openWO > 0)) && (
          <div className="space-y-2">
            {lease.cta && (
              <NotifBanner tone="approved">
                <span>Your lease is ready — <span className="font-semibold">signature required</span></span>
                <Link href={`${BASE}/lease`} className="shrink-0 font-semibold text-primary hover:underline underline-offset-2">
                  Sign now →
                </Link>
              </NotifBanner>
            )}
            {pendingCharges.length > 0 && (
              <NotifBanner tone="pending">
                <span>
                  <span className="font-semibold">
                    ${(pendingTotal / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>{" "}
                  outstanding balance — {pendingCharges.length} pending charge{pendingCharges.length === 1 ? "" : "s"}
                </span>
                <Link href={`${BASE}/charges`} className="shrink-0 font-semibold text-primary hover:underline underline-offset-2">
                  View charges →
                </Link>
              </NotifBanner>
            )}
            {inbox > 0 && (
              <NotifBanner tone="approved">
                <span>
                  <span className="font-semibold">{inbox}</span> unread message{inbox === 1 ? "" : "s"} in your inbox
                </span>
                <Link href={`${BASE}/inbox/unopened`} className="shrink-0 font-semibold text-primary hover:underline underline-offset-2">
                  Open inbox →
                </Link>
              </NotifBanner>
            )}
            {canUseFullPortal && openWO > 0 && (
              <NotifBanner tone="overdue">
                <span>
                  <span className="font-semibold">{openWO}</span> open maintenance request{openWO === 1 ? "" : "s"} awaiting scheduling
                </span>
                <Link href={`${BASE}/services/work-orders`} className="shrink-0 font-semibold text-primary hover:underline underline-offset-2">
                  View →
                </Link>
              </NotifBanner>
            )}
          </div>
        )}

        {appStatus === "approved" ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">

            {/* Lease */}
            <InfoCard title="Lease">
              <div className="flex items-center justify-between gap-3">
                <StatusBadge label={lease.label} tone={lease.tone} />
                {leaseRow?.application?.leaseStart ? (
                  <span className="text-xs text-muted">
                    {leaseRow.application.leaseStart}
                    {leaseRow.application.leaseEnd ? ` → ${leaseRow.application.leaseEnd}` : ""}
                  </span>
                ) : null}
              </div>
              <Link href={`${BASE}/lease`} className="mt-3 block text-xs font-semibold text-primary hover:underline underline-offset-2">
                {lease.cta ? "Sign your lease →" : "View lease details →"}
              </Link>
            </InfoCard>

            {/* Charges */}
            <InfoCard title="Charges & payments">
              {pendingCharges.length === 0 ? (
                <p className="text-sm text-muted">No outstanding charges.</p>
              ) : (
                <>
                  <p className="text-2xl font-bold tracking-tight text-foreground">
                    ${(pendingTotal / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {pendingCharges.length} pending charge{pendingCharges.length === 1 ? "" : "s"}
                  </p>
                </>
              )}
              <Link href={`${BASE}/charges`} className="mt-3 block text-xs font-semibold text-primary hover:underline underline-offset-2">
                View all charges →
              </Link>
            </InfoCard>

            {/* Maintenance */}
            {canUseFullPortal ? (
              <InfoCard title="Maintenance">
                <div className="space-y-1 text-sm">
                  {openWO + scheduledWO === 0 ? (
                    <p className="text-muted">No active requests.</p>
                  ) : (
                    <>
                      {openWO > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-muted">Open</span>
                          <span className="font-semibold text-[var(--status-overdue-fg)]">{openWO}</span>
                        </div>
                      )}
                      {scheduledWO > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-muted">Scheduled</span>
                          <span className="font-semibold text-[var(--status-approved-fg)]">{scheduledWO}</span>
                        </div>
                      )}
                      {completedWO > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Completed</span>
                          <span className="text-slate-500">{completedWO}</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
                <Link href={`${BASE}/services/work-orders`} className="mt-3 block text-xs font-semibold text-primary hover:underline underline-offset-2">
                  {openWO + scheduledWO > 0 ? "Manage requests →" : "Submit a request →"}
                </Link>
              </InfoCard>
            ) : (
              <InfoCard title="Maintenance">
                <p className="text-sm text-muted">Available on upgraded property plans.</p>
              </InfoCard>
            )}

            {/* Inbox */}
            <InfoCard title="Inbox">
              {inbox > 0 ? (
                <p className="text-sm font-semibold text-slate-900">
                  {inbox} unread message{inbox === 1 ? "" : "s"}
                </p>
              ) : (
                <p className="text-sm text-slate-500">No unread messages.</p>
              )}
              <Link href={`${BASE}/inbox/unopened`} className="mt-3 block text-xs font-semibold text-primary hover:underline underline-offset-2">
                Open inbox →
              </Link>
            </InfoCard>

            {/* Property info */}
            {appProperty && (
              <InfoCard title="Your property">
                <p className="text-sm font-semibold text-slate-900">{appProperty}</p>
                {appId && <p className="mt-0.5 text-xs font-mono text-slate-400">{appId}</p>}
              </InfoCard>
            )}

          </div>
        ) : (
          /* ── Pre-approval layout ── */
          <div className="grid gap-4 sm:grid-cols-2">
            <InfoCard title="Application">
              <p className="text-sm font-semibold text-slate-900">{appStage}</p>
              {appId && <p className="mt-0.5 text-xs font-mono text-slate-400">{appId}</p>}
              {appProperty && <p className="mt-1 text-xs text-slate-500">{appProperty}</p>}
            </InfoCard>
            <InfoCard title="Inbox">
              {inbox > 0 ? (
                <p className="text-sm font-semibold text-slate-900">{inbox} unread message{inbox === 1 ? "" : "s"}</p>
              ) : (
                <p className="text-sm text-slate-500">No unread messages.</p>
              )}
              <Link href={`${BASE}/inbox/unopened`} className="mt-3 block text-xs font-semibold text-primary hover:underline underline-offset-2">
                Open inbox →
              </Link>
            </InfoCard>
          </div>
        )}

      </div>
    </ManagerPortalPageShell>
  );
}
