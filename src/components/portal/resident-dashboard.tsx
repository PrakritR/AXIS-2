"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
  tone: "emerald" | "amber" | "sky" | "slate" | "violet";
  cta: boolean;
} {
  if (!approved || !row) return { label: "Not started", tone: "slate", cta: false };
  if (!residentCanViewLeaseRow(row)) {
    if (row.status === "Voided") return { label: "Voided", tone: "slate", cta: false };
    return { label: "Being prepared", tone: "slate", cta: false };
  }
  switch (row.status) {
    case "Fully Signed": return { label: "Active ✓", tone: "emerald", cta: false };
    case "Resident Signature Pending": return { label: "Sign now", tone: "violet", cta: true };
    case "Manager Signature Pending": return { label: "Awaiting manager", tone: "sky", cta: false };
    default: return { label: row.status || "In progress", tone: "amber", cta: false };
  }
}

function StatusBadge({ label, tone }: { label: string; tone: string }) {
  const cls: Record<string, string> = {
    emerald: "bg-emerald-100 text-emerald-800",
    amber: "bg-amber-100 text-amber-900",
    sky: "bg-sky-100 text-sky-800",
    slate: "bg-slate-100 text-slate-700",
    violet: "bg-violet-100 text-violet-800",
    rose: "bg-rose-100 text-rose-800",
  };
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${cls[tone] ?? cls.slate}`}>
      {label}
    </span>
  );
}

function NotifBanner({
  tone,
  children,
}: {
  tone: "amber" | "blue" | "violet" | "rose";
  children: React.ReactNode;
}) {
  const cls = {
    amber: "border-amber-200/80 bg-amber-50/80 text-amber-950",
    blue: "border-blue-200/80 bg-blue-50/80 text-blue-950",
    violet: "border-violet-200/80 bg-violet-50/80 text-violet-950",
    rose: "border-rose-200/80 bg-rose-50/80 text-rose-950",
  }[tone];
  return (
    <div className={`flex items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-sm ${cls}`}>
      {children}
    </div>
  );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">{title}</p>
      <div className="mt-3">{children}</div>
    </div>
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
  const initialEmail = residentEmail.trim().toLowerCase();
  const session = usePortalSession({ userId: residentUserId, email: initialEmail || null });
  const email = session.email?.trim().toLowerCase() || initialEmail;
  const managerIsFree = managerSubscriptionTier === "free";
  const canUseFullPortal = applicationApproved && !managerIsFree;

  const [appStatus, setAppStatus] = useState<AppStatus>(applicationApproved ? "approved" : "pending");
  const [appStage, setAppStage] = useState(applicationApproved ? "Approved" : "Submitted");
  const [appProperty, setAppProperty] = useState<string | null>(null);
  const [appId, setAppId] = useState<string | null>(initialApplicationId);

  const [tick, setTick] = useState(0);
  const bump = () => setTick((n) => n + 1);

  useEffect(() => {
    void Promise.allSettled([
      syncLeasePipelineFromServer(),
      syncManagerWorkOrdersFromServer(),
      syncPersistedInboxFromServer(RESIDENT_INBOX_STORAGE_KEY),
      syncHouseholdChargesFromServer(),
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let alive = true;
    const apply = () => {
      const rows = readManagerApplicationRows();
      const row = email ? rows.find((r) => r.email?.trim().toLowerCase() === email) : undefined;
      if (!alive) return;
      if (row?.bucket === "approved" || row?.bucket === "rejected" || row?.bucket === "pending") {
        setAppStatus(row.bucket);
        setAppStage(row.stage?.trim() || row.bucket);
        setAppProperty(row.property?.trim() || null);
        setAppId(row.id?.trim() || null);
      } else {
        setAppStatus(applicationApproved ? "approved" : "pending");
        setAppStage(applicationApproved ? "Approved" : "Submitted");
        setAppProperty(null);
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
  let statusTone = "border-amber-200/80 bg-amber-50/80 text-amber-950";
  let statusCopy = "Application submitted and pending manager review. Your portal will unlock after approval.";
  if (showTestAccessNote) {
    statusTone = "border-sky-200/80 bg-sky-50/80 text-sky-950";
    statusCopy = "Test access active — resident portal is fully unlocked for this email.";
  } else if (appStatus === "approved") {
    statusTone = "border-emerald-200/70 bg-emerald-50/80 text-emerald-950";
    statusCopy = appProperty
      ? `Approved for ${appProperty}.${managerIsFree ? " Lease and work orders require an upgraded property plan." : ""}`
      : `Approved and active.${managerIsFree ? " Lease and work orders require an upgraded property plan." : ""}`;
  } else if (appStatus === "rejected") {
    statusTone = "border-rose-200/70 bg-rose-50/80 text-rose-950";
    statusCopy = "Your most recent application is marked rejected. Contact your manager if you need help or want to reapply.";
  }

  return (
    <ManagerPortalPageShell title={`Welcome${displayName && displayName !== "Resident" ? `, ${displayName.split(" ")[0]}` : ""}`}>
      <div className="space-y-5">

        {/* ── Application status notice ── */}
        <div className={`rounded-2xl border px-4 py-3 text-sm ${statusTone}`}>{statusCopy}</div>

        {/* ── Action-required banners (only when actionable) ── */}
        {(lease.cta || pendingCharges.length > 0 || inbox > 0 || (canUseFullPortal && openWO > 0)) && (
          <div className="space-y-2">
            {lease.cta && (
              <NotifBanner tone="violet">
                <span>Your lease is ready — <span className="font-semibold">signature required</span></span>
                <Link href={`${BASE}/lease`} className="shrink-0 font-semibold text-primary hover:underline underline-offset-2">
                  Sign now →
                </Link>
              </NotifBanner>
            )}
            {pendingCharges.length > 0 && (
              <NotifBanner tone="amber">
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
              <NotifBanner tone="blue">
                <span>
                  <span className="font-semibold">{inbox}</span> unread message{inbox === 1 ? "" : "s"} in your inbox
                </span>
                <Link href={`${BASE}/inbox/unopened`} className="shrink-0 font-semibold text-primary hover:underline underline-offset-2">
                  Open inbox →
                </Link>
              </NotifBanner>
            )}
            {canUseFullPortal && openWO > 0 && (
              <NotifBanner tone="rose">
                <span>
                  <span className="font-semibold">{openWO}</span> open maintenance request{openWO === 1 ? "" : "s"} awaiting scheduling
                </span>
                <Link href={`${BASE}/work-orders`} className="shrink-0 font-semibold text-primary hover:underline underline-offset-2">
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
                  <span className="text-xs text-slate-500">
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
                <p className="text-sm text-slate-500">No outstanding charges.</p>
              ) : (
                <>
                  <p className="text-2xl font-bold tracking-tight text-slate-900">
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
                    <p className="text-slate-500">No active requests.</p>
                  ) : (
                    <>
                      {openWO > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-600">Open</span>
                          <span className="font-semibold text-rose-700">{openWO}</span>
                        </div>
                      )}
                      {scheduledWO > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-600">Scheduled</span>
                          <span className="font-semibold text-sky-700">{scheduledWO}</span>
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
                <Link href={`${BASE}/work-orders`} className="mt-3 block text-xs font-semibold text-primary hover:underline underline-offset-2">
                  {openWO + scheduledWO > 0 ? "Manage requests →" : "Submit a request →"}
                </Link>
              </InfoCard>
            ) : (
              <InfoCard title="Maintenance">
                <p className="text-sm text-slate-500">Available on upgraded property plans.</p>
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
