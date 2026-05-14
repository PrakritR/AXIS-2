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
  HOUSEHOLD_CHARGES_EVENT,
  isHouseholdChargeOverdue,
  readChargesForManager,
  syncHouseholdChargesFromServer,
} from "@/lib/household-charges";
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
  SERVICE_REQUESTS_EVENT,
  readServiceRequestsForManager,
} from "@/lib/service-requests-storage";
import {
  countUnopenedPersistedInbox,
  MANAGER_INBOX_STORAGE_KEY,
  PORTAL_INBOX_CHANGED_EVENT,
  syncPersistedInboxFromServer,
} from "@/lib/portal-inbox-storage";
import { ManagerPortalPageShell } from "@/components/portal/portal-metrics";
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
  tone: "amber" | "blue" | "yellow" | "violet" | "rose";
  children: React.ReactNode;
}) {
  const cls = {
    amber: "border-amber-200/80 bg-amber-50/80 text-amber-950",
    blue: "border-blue-200/80 bg-blue-50/80 text-blue-950",
    yellow: "border-yellow-200/80 bg-yellow-50/80 text-yellow-950",
    violet: "border-violet-200/80 bg-violet-50/80 text-violet-950",
    rose: "border-rose-200/80 bg-rose-50/80 text-rose-950",
  }[tone];
  return (
    <div className={`flex items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-sm ${cls}`}>
      {children}
    </div>
  );
}

function Tile({
  label,
  value,
  sub,
  href,
  urgent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  href: string;
  urgent?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`group flex flex-col gap-1 rounded-2xl border bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.06)] transition hover:shadow-md ${
        urgent ? "border-amber-300/80 ring-1 ring-amber-200/60" : "border-slate-200/80 hover:border-slate-300"
      }`}
    >
      <p className="text-[2rem] font-bold leading-none tracking-[-0.03em] text-slate-900">{value}</p>
      <p className="text-sm font-medium text-slate-600">{label}</p>
      {sub ? <p className="text-xs text-slate-400">{sub}</p> : null}
    </Link>
  );
}

function SectionHeader({ title, href, linkLabel }: { title: string; href?: string; linkLabel?: string }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">{title}</h2>
      {href && linkLabel ? (
        <Link href={href} className="text-xs font-semibold text-primary hover:underline underline-offset-2">
          {linkLabel}
        </Link>
      ) : null}
    </div>
  );
}

export function ManagerDashboard() {
  const { userId } = useManagerUserId();
  const [tick, setTick] = useState(0);
  const bump = () => setTick((n) => n + 1);

  useEffect(() => {
    void Promise.allSettled([
      syncManagerApplicationsFromServer(),
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
    window.addEventListener(SERVICE_REQUESTS_EVENT, bump);
    return () => {
      window.removeEventListener(PROPERTY_PIPELINE_EVENT, bump);
      window.removeEventListener(LEASE_PIPELINE_EVENT, bump);
      window.removeEventListener(MANAGER_APPLICATIONS_EVENT, bump);
      window.removeEventListener(HOUSEHOLD_CHARGES_EVENT, bump);
      window.removeEventListener(ADMIN_UI_EVENT, bump);
      window.removeEventListener(PORTAL_INBOX_CHANGED_EVENT, bump);
      window.removeEventListener("storage", bump);
      window.removeEventListener(SERVICE_REQUESTS_EVENT, bump);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const data = useMemo(() => {
    void tick;
    if (!userId) return null;

    const allApps = readManagerApplicationRows().filter((a) => applicationVisibleToPortalUser(a, userId));
    const pendingApps = allApps.filter((a) => a.bucket === "pending");
    const activeResidents = allApps.filter((a) => a.bucket === "approved");

    const leases = readLeasePipeline(userId);
    const needsManagerSig = leases.filter((l) => l.status === "Manager Signature Pending").length;
    const totalLeases = leases.length;

    const allServiceRequests = readServiceRequestsForManager(userId);
    const pendingServiceRequests = allServiceRequests.filter((r) => r.status === "pending");
    const approvedServiceRequests = allServiceRequests.filter((r) => r.status === "approved");

    const charges = readChargesForManager(userId);
    const overdueCharges = charges.filter((c) => isHouseholdChargeOverdue(c));
    const overdueTotal = overdueCharges.reduce((s, c) => {
      const n = Number(c.balanceLabel.replace(/[^\d.]/g, ""));
      return s + (Number.isFinite(n) ? Math.round(n * 100) : 0);
    }, 0);

    const inbox = countUnopenedPersistedInbox(MANAGER_INBOX_STORAGE_KEY, []);

    const [p0, , p2] = adminKpiCounts(userId);
    const pendingProperties = p0;
    const publishedProperties = p2;
    const totalProperties = publishedProperties + pendingProperties;

    const cutoff = Date.now() - 30 * 60 * 1000;
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
      overdueCharges,
      overdueTotal,
      inbox,
      totalLeases,
      needsManagerSig,
      totalProperties,
      pendingProperties,
      tours,
      pendingServiceRequests,
      approvedServiceRequests,
    };
  }, [tick, userId]);

  if (!data) return null;

  const {
    pendingApps,
    activeResidents,
    overdueCharges,
    overdueTotal,
    inbox,
    totalLeases,
    needsManagerSig,
    totalProperties,
    pendingProperties,
    tours,
    pendingServiceRequests,
    approvedServiceRequests,
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
            {pendingApps.length > 0 && (
              <NotifBanner tone="amber">
                <span>
                  <span className="font-semibold">{pendingApps.length}</span> application{pendingApps.length === 1 ? "" : "s"} waiting for a decision
                </span>
                <Link href={`${BASE}/applications`} className="shrink-0 font-semibold text-primary hover:underline underline-offset-2">
                  Review →
                </Link>
              </NotifBanner>
            )}
            {needsManagerSig > 0 && (
              <NotifBanner tone="violet">
                <span>
                  <span className="font-semibold">{needsManagerSig}</span> lease{needsManagerSig === 1 ? "" : "s"} need{needsManagerSig === 1 ? "s" : ""} your signature
                </span>
                <Link href={`${BASE}/leases`} className="shrink-0 font-semibold text-primary hover:underline underline-offset-2">
                  Sign →
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
            {pendingTours.length > 0 && (
              <NotifBanner tone="amber">
                <span>
                  <span className="font-semibold">{pendingTours.length}</span> pending tour request{pendingTours.length === 1 ? "" : "s"} awaiting your approval
                </span>
                <Link href={`${BASE}/calendar`} className="shrink-0 font-semibold text-primary hover:underline underline-offset-2">
                  Review →
                </Link>
              </NotifBanner>
            )}
            {nextTour && (
              <NotifBanner tone="yellow">
                <span>
                  Next confirmed tour{tours.filter((t) => t.status === "confirmed").length > 1 ? ` (${tours.filter((t) => t.status === "confirmed").length} total)` : ""}: <span className="font-semibold">{nextTour.label}</span>{nextTour.propertyTitle ? ` · ${nextTour.propertyTitle}` : ""} at <span className="font-semibold">{fmt(nextTour.start)}</span>
                </span>
                <Link href={`${BASE}/calendar`} className="shrink-0 font-semibold text-primary hover:underline underline-offset-2">
                  Calendar →
                </Link>
              </NotifBanner>
            )}
            {pendingProperties > 0 && (
              <NotifBanner tone="rose">
                <span>
                  <span className="font-semibold">{pendingProperties}</span> propert{pendingProperties === 1 ? "y" : "ies"} pending Axis approval
                </span>
                <Link href={`${BASE}/properties`} className="shrink-0 font-semibold text-primary hover:underline underline-offset-2">
                  View →
                </Link>
              </NotifBanner>
            )}
            {overdueCharges.length > 0 && (
              <NotifBanner tone="amber">
                <span>
                  <span className="font-semibold">{overdueCharges.length}</span> overdue charge{overdueCharges.length === 1 ? "" : "s"} totalling <span className="font-semibold">{dollars(overdueTotal)}</span> across residents
                </span>
                <Link href={`${BASE}/residents`} className="shrink-0 font-semibold text-primary hover:underline underline-offset-2">
                  View →
                </Link>
              </NotifBanner>
            )}
          </div>
        )}

        {/* ── KPI tiles ── */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile
            label="Properties"
            value={totalProperties}
            sub={pendingProperties > 0 ? `${pendingProperties} pending approval` : undefined}
            href={`${BASE}/properties`}
            urgent={pendingProperties > 0}
          />
          <Tile
            label="Active residents"
            value={activeResidents.length}
            sub={pendingApps.length > 0 ? `${pendingApps.length} pending review` : undefined}
            href={`${BASE}/residents`}
            urgent={pendingApps.length > 0}
          />
          <Tile
            label="Service requests"
            value={pendingServiceRequests.length + approvedServiceRequests.length}
            sub={pendingServiceRequests.length > 0 ? `${pendingServiceRequests.length} awaiting approval` : approvedServiceRequests.length > 0 ? `${approvedServiceRequests.length} active` : undefined}
            href={`${BASE}/residents`}
            urgent={pendingServiceRequests.length > 0}
          />
          <Tile
            label="Leases"
            value={totalLeases}
            sub={needsManagerSig > 0 ? `${needsManagerSig} need your signature` : undefined}
            href={`${BASE}/leases`}
            urgent={needsManagerSig > 0}
          />
        </div>

        {/* ── Bottom three-column section ── */}
        <div className="grid gap-4 lg:grid-cols-3">

          {/* Pending applications */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
            <SectionHeader
              title="Pending applications"
              href={`${BASE}/applications`}
              linkLabel={pendingApps.length > 4 ? `View all ${pendingApps.length}` : "View all"}
            />
            {pendingApps.length === 0 ? (
              <p className="mt-4 text-sm text-slate-400">No pending applications — you're all caught up.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {pendingApps.slice(0, 5).map((app: DemoApplicantRow) => (
                  <li key={app.id} className="flex items-start justify-between gap-3 rounded-xl bg-slate-50/70 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{app.name || app.email || "Unknown"}</p>
                      <p className="truncate text-xs text-slate-500">{app.property || "—"}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-semibold text-amber-800">
                      {app.stage || "Pending"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Service requests */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
            <SectionHeader
              title="Service requests"
              href={`${BASE}/residents`}
              linkLabel="View all"
            />
            {pendingServiceRequests.length + approvedServiceRequests.length === 0 ? (
              <p className="mt-4 text-sm text-slate-400">No active service requests right now.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {[...pendingServiceRequests, ...approvedServiceRequests].slice(0, 5).map((sr) => (
                  <li key={sr.id} className="flex items-start justify-between gap-3 rounded-xl bg-slate-50/70 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{sr.offerName}</p>
                      <p className="truncate text-xs text-slate-500">{sr.residentName || sr.residentEmail || "—"}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                      sr.status === "pending"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-sky-100 text-sky-800"
                    }`}>
                      {sr.status === "pending" ? "Pending" : "Approved"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Pending tours */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
            <SectionHeader
              title="Pending tour requests"
              href={`${BASE}/calendar`}
              linkLabel="Calendar →"
            />
            {pendingTours.length === 0 ? (
              <p className="mt-4 text-sm text-slate-400">No pending tour requests right now.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {pendingTours.slice(0, 5).map((tour) => (
                  <li key={tour.id} className="flex items-start justify-between gap-3 rounded-xl bg-slate-50/70 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{tour.label}</p>
                      <p className="truncate text-xs text-slate-500">{tour.propertyTitle || "—"} · {fmt(tour.start)}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-semibold text-amber-800">
                      Pending
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

        </div>
      </div>
    </ManagerPortalPageShell>
  );
}
