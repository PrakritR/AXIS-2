"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { DemoApplicantRow } from "@/data/demo-portal";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import { adminKpiCounts } from "@/lib/demo-admin-property-inventory";
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
  countUnopenedPersistedInbox,
  loadPersistedInbox,
  MANAGER_INBOX_STORAGE_KEY,
  PORTAL_INBOX_CHANGED_EVENT,
  syncPersistedInboxFromServer,
} from "@/lib/portal-inbox-storage";
import {
  ManagerPortalPageShell,
  PortalDashboardSectionHeader,
  PortalDashboardTile,
  PORTAL_DASHBOARD_SECTION_CARD,
} from "@/components/portal/portal-metrics";
import { formatPacificDateTime } from "@/lib/pacific-time";

const BASE = "/portal";

function fmt(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "soon";
  return formatPacificDateTime(d);
}

function dollars(cents: number) {
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function NotifBanner({
  tone,
  children,
}: {
  tone: "amber" | "blue" | "yellow" | "rose";
  children: React.ReactNode;
}) {
  const cls = {
    amber: "portal-banner-pending",
    blue: "portal-banner-info",
    yellow: "portal-banner-pending",
    rose: "portal-banner-danger",
  }[tone];
  return (
    <div className={`flex items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-sm ${cls}`}>
      {children}
    </div>
  );
}

export function ManagerDashboard() {
  const { userId } = useManagerUserId();
  const [tick, setTick] = useState(0);
  const bump = () => setTick((n) => n + 1);
  const [nowMs] = useState(() => Date.now());

  useEffect(() => {
    void Promise.allSettled([
      syncManagerApplicationsFromServer({ managerUserId: userId }),
      syncLeasePipelineFromServer(userId),
      syncPersistedInboxFromServer(MANAGER_INBOX_STORAGE_KEY),
      syncHouseholdChargesFromServer(),
      syncScheduleRecordsFromServer(),
    ]).then(bump);
    window.addEventListener(PROPERTY_PIPELINE_EVENT, bump);
    window.addEventListener(LEASE_PIPELINE_EVENT, bump);
    window.addEventListener(MANAGER_APPLICATIONS_EVENT, bump);
    window.addEventListener(HOUSEHOLD_CHARGES_EVENT, bump);
    window.addEventListener(ADMIN_UI_EVENT, bump);
    window.addEventListener(PORTAL_INBOX_CHANGED_EVENT, bump);
    window.addEventListener("storage", bump);
    return () => {
      window.removeEventListener(PROPERTY_PIPELINE_EVENT, bump);
      window.removeEventListener(LEASE_PIPELINE_EVENT, bump);
      window.removeEventListener(MANAGER_APPLICATIONS_EVENT, bump);
      window.removeEventListener(HOUSEHOLD_CHARGES_EVENT, bump);
      window.removeEventListener(ADMIN_UI_EVENT, bump);
      window.removeEventListener(PORTAL_INBOX_CHANGED_EVENT, bump);
      window.removeEventListener("storage", bump);
    };
   
  }, [userId]);

  const data = useMemo(() => {
    void tick;
    if (!userId) return null;

    const allApps = readManagerApplicationRows().filter((a) => applicationVisibleToPortalUser(a, userId));
    const pendingApps = allApps.filter((a) => a.bucket === "pending");
    const activeResidents = allApps.filter((a) => a.bucket === "approved");

    const leases = readLeasePipeline(userId);
    const pendingLeaseRows = leases
      .filter((l) => l.status === "Manager Signature Pending" || l.status === "Resident Signature Pending")
      .sort((a, b) => new Date(b.updatedAtIso).getTime() - new Date(a.updatedAtIso).getTime());
    const needsManagerSig = pendingLeaseRows.filter((l) => l.status === "Manager Signature Pending").length;

    const charges = readChargesForManager(userId);
    const pendingCharges = charges
      .filter((c) => c.status === "pending")
      .sort((a, b) => {
        const aOverdue = isHouseholdChargeOverdue(a);
        const bOverdue = isHouseholdChargeOverdue(b);
        if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
    const overdueCharges = pendingCharges.filter((c) => isHouseholdChargeOverdue(c));
    const overdueTotal = overdueCharges.reduce((s, c) => {
      const n = Number(c.balanceLabel.replace(/[^\d.]/g, ""));
      return s + (Number.isFinite(n) ? Math.round(n * 100) : 0);
    }, 0);

    const inboxCount = countUnopenedPersistedInbox(MANAGER_INBOX_STORAGE_KEY, []);
    const inboxThreads = loadPersistedInbox(MANAGER_INBOX_STORAGE_KEY, [])
      .filter((t) => t.folder === "inbox" && t.unread)
      .slice(0, 5);

    const [p0, , p2] = adminKpiCounts(userId);
    const pendingProperties = p0;
    const publishedProperties = p2;
    const totalProperties = publishedProperties + pendingProperties;

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
      activeResidents,
      pendingLeaseRows,
      pendingCharges,
      overdueCharges,
      overdueTotal,
      inbox: inboxCount,
      inboxThreads,
      needsManagerSig,
      totalProperties,
      pendingProperties,
      tours,
    };
  }, [tick, userId, nowMs]);

  if (!data) return null;

  const {
    pendingApps,
    activeResidents,
    pendingLeaseRows,
    pendingCharges,
    overdueCharges,
    overdueTotal,
    inbox,
    inboxThreads,
    needsManagerSig,
    totalProperties,
    pendingProperties,
    tours,
  } = data;

  const pendingTours = tours.filter((t) => t.status === "pending");
  const nextTour = tours.find((t) => t.status === "confirmed") ?? null;

  return (
    <ManagerPortalPageShell title="Dashboard">
      <div className="space-y-5">

        {/* ── Action-required banners ── */}
        {(pendingApps.length > 0 ||
          needsManagerSig > 0 ||
          inbox > 0 ||
          pendingTours.length > 0 ||
          nextTour ||
          pendingProperties > 0 ||
          overdueCharges.length > 0) && (
          <div className="space-y-2">
            {pendingTours.length > 0 && (
              <NotifBanner tone="amber">
                <span>
                  <span className="font-semibold">{pendingTours.length}</span> pending tour request{pendingTours.length === 1 ? "" : "s"} awaiting your approval
                </span>
                <Link href={`${BASE}/calendar`} className="shrink-0 font-semibold text-primary hover:underline underline-offset-2">
                  Tours →
                </Link>
              </NotifBanner>
            )}
            {pendingApps.length > 0 && (
              <NotifBanner tone="amber">
                <span>
                  <span className="font-semibold">{pendingApps.length}</span> application{pendingApps.length === 1 ? "" : "s"} waiting for a decision
                </span>
                <Link href={`${BASE}/applications`} className="shrink-0 font-semibold text-primary hover:underline underline-offset-2">
                  Applications →
                </Link>
              </NotifBanner>
            )}
            {needsManagerSig > 0 && (
              <NotifBanner tone="blue">
                <span>
                  <span className="font-semibold">{needsManagerSig}</span> lease{needsManagerSig === 1 ? "" : "s"} need{needsManagerSig === 1 ? "s" : ""} your signature
                </span>
                <Link href={`${BASE}/leases`} className="shrink-0 font-semibold text-primary hover:underline underline-offset-2">
                  Leases →
                </Link>
              </NotifBanner>
            )}
            {inbox > 0 && (
              <NotifBanner tone="blue">
                <span>
                  <span className="font-semibold">{inbox}</span> unread message{inbox === 1 ? "" : "s"} in your inbox
                </span>
                <Link href={`${BASE}/inbox/unopened`} className="shrink-0 font-semibold text-primary hover:underline underline-offset-2">
                  Inbox →
                </Link>
              </NotifBanner>
            )}
            {nextTour && (
              <NotifBanner tone="yellow">
                <span>
                  Next confirmed tour{tours.filter((t) => t.status === "confirmed").length > 1 ? ` (${tours.filter((t) => t.status === "confirmed").length} total)` : ""}: <span className="font-semibold">{nextTour.label}</span>{nextTour.propertyTitle ? ` · ${nextTour.propertyTitle}` : ""} at <span className="font-semibold">{fmt(nextTour.start)}</span>
                </span>
                <Link href={`${BASE}/calendar`} className="shrink-0 font-semibold text-primary hover:underline underline-offset-2">
                  Tours →
                </Link>
              </NotifBanner>
            )}
            {pendingProperties > 0 && (
              <NotifBanner tone="amber">
                <span>
                  <span className="font-semibold">{pendingProperties}</span> propert{pendingProperties === 1 ? "y" : "ies"} pending Axis approval
                </span>
                <Link href={`${BASE}/properties`} className="shrink-0 font-semibold text-primary hover:underline underline-offset-2">
                  Properties →
                </Link>
              </NotifBanner>
            )}
            {overdueCharges.length > 0 && (
              <NotifBanner tone="rose">
                <span>
                  <span className="font-semibold">{overdueCharges.length}</span> overdue charge{overdueCharges.length === 1 ? "" : "s"} totalling <span className="font-semibold">{dollars(overdueTotal)}</span> across residents
                </span>
                <Link href={`${BASE}/payments`} className="shrink-0 font-semibold text-primary hover:underline underline-offset-2">
                  Payments →
                </Link>
              </NotifBanner>
            )}
          </div>
        )}

        {/* ── KPI tiles ── */}
        <div className="grid grid-cols-2 gap-3">
          <PortalDashboardTile
            label="Properties"
            value={totalProperties}
            sub={pendingProperties > 0 ? `${pendingProperties} pending approval` : undefined}
            href={`${BASE}/properties`}
            urgent={pendingProperties > 0}
          />
          <PortalDashboardTile
            label="Active residents"
            value={activeResidents.length}
            sub={pendingApps.length > 0 ? `${pendingApps.length} pending review` : undefined}
            href={`${BASE}/residents`}
            urgent={pendingApps.length > 0}
          />
        </div>

        {/* ── Tours & applications ── */}
        <div className="grid gap-4 lg:grid-cols-2">

          {/* Pending tours */}
          <div className={PORTAL_DASHBOARD_SECTION_CARD}>
            <PortalDashboardSectionHeader
              title="Pending tour requests"
              href={`${BASE}/calendar`}
              linkLabel="Tours →"
            />
            {pendingTours.length === 0 ? (
              <p className="mt-4 text-sm text-muted">No pending tour requests right now.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {pendingTours.slice(0, 5).map((tour) => (
                  <li key={tour.id} className="flex items-start justify-between gap-3 rounded-xl bg-accent/30 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{tour.label}</p>
                      <p className="truncate text-xs text-muted">{tour.propertyTitle || "—"} · {fmt(tour.start)}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-semibold text-amber-800">
                      Pending
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Pending applications */}
          <div className={PORTAL_DASHBOARD_SECTION_CARD}>
            <PortalDashboardSectionHeader
              title="Pending applications"
              href={`${BASE}/applications`}
              linkLabel="Applications →"
            />
            {pendingApps.length === 0 ? (
              <p className="mt-4 text-sm text-muted">No pending applications — you&apos;re all caught up.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {pendingApps.slice(0, 5).map((app: DemoApplicantRow) => (
                  <li key={app.id} className="flex items-start justify-between gap-3 rounded-xl bg-accent/30 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{app.name || app.email || "Unknown"}</p>
                      <p className="truncate text-xs text-muted">{app.property || "—"}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-semibold text-amber-800">
                      {app.stage || "Pending"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

        </div>

        {/* ── Leases & payments ── */}
        <div className="grid gap-4 lg:grid-cols-2">
          <div className={PORTAL_DASHBOARD_SECTION_CARD}>
            <PortalDashboardSectionHeader
              title="Leases pending signature"
              href={`${BASE}/leases`}
              linkLabel="Leases →"
            />
            {pendingLeaseRows.length === 0 ? (
              <p className="mt-4 text-sm text-muted">No leases waiting for a signature.</p>
            ) : (
              <ul className="portal-desktop-scroll-panel mt-3 space-y-2 overscroll-contain pr-1">
                {pendingLeaseRows.map((lease: LeasePipelineRow) => (
                  <li key={lease.id} className="flex items-start justify-between gap-3 rounded-xl bg-accent/30 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{lease.residentName || lease.residentEmail}</p>
                      <p className="truncate text-xs text-muted">
                        {lease.unit || "—"}{lease.signedRentLabel ? ` · ${lease.signedRentLabel}` : ""}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                        lease.status === "Manager Signature Pending"
                          ? "bg-blue-100 text-blue-800"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {lease.status === "Manager Signature Pending" ? "Your signature" : "Resident signing"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className={PORTAL_DASHBOARD_SECTION_CARD}>
            <PortalDashboardSectionHeader
              title="Pending & overdue payments"
              href={`${BASE}/payments`}
              linkLabel="Payments →"
            />
            {pendingCharges.length === 0 ? (
              <p className="mt-4 text-sm text-muted">No pending or overdue payments right now.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {pendingCharges.slice(0, 5).map((charge) => {
                  const overdue = isHouseholdChargeOverdue(charge);
                  return (
                    <li key={charge.id} className="flex items-start justify-between gap-3 rounded-xl bg-accent/30 px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{charge.residentName || charge.residentEmail}</p>
                        <p className="truncate text-xs text-muted">
                          {charge.title || "Charge"} · {charge.balanceLabel} · {chargeDueLabel(charge)}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                          overdue ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {overdue ? "Overdue" : "Pending"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* ── Inbox ── */}
        <div className={PORTAL_DASHBOARD_SECTION_CARD}>
          <PortalDashboardSectionHeader
            title="Inbox"
            href={`${BASE}/inbox/unopened`}
            linkLabel="Inbox →"
          />
          {inbox === 0 ? (
            <p className="mt-4 text-sm text-muted">No unread messages — inbox is clear.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {inboxThreads.map((thread) => (
                <li key={thread.id} className="flex items-start justify-between gap-3 rounded-xl bg-accent/30 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{thread.from || "Unknown sender"}</p>
                    <p className="truncate text-xs text-muted">{thread.subject || thread.preview || "—"}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-blue-100 px-2.5 py-0.5 text-[10px] font-semibold text-blue-800">
                    Unread
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </ManagerPortalPageShell>
  );
}
