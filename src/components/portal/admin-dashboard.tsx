"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PORTAL_SECTION_SURFACE } from "@/components/portal/portal-metrics";
import { readInboxMessages } from "@/lib/demo-admin-partner-inbox";
import { adminLeaseKpiCounts } from "@/lib/demo-admin-leases";
import { adminKpiCounts } from "@/lib/demo-admin-property-inventory";
import {
  getPartnerInquiryWindows,
  pendingInquiryCount,
  readPartnerInquiries,
  readPlannedEvents,
  syncScheduleRecordsFromServer,
} from "@/lib/demo-admin-scheduling";
import { ADMIN_UI_EVENT } from "@/lib/demo-admin-ui";
import { PROPERTY_PIPELINE_EVENT } from "@/lib/demo-property-pipeline";
import { LEASE_PIPELINE_EVENT, syncLeasePipelineFromServer } from "@/lib/lease-pipeline-storage";

type PortalCounts = { managers: number; residents: number; owners: number };

function fmt(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "soon";
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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

export function AdminDashboard() {
  const [tick, setTick] = useState(0);
  const bump = () => setTick((n) => n + 1);
  const [counts, setCounts] = useState<PortalCounts>({ managers: 0, residents: 0, owners: 0 });
  const [cutoffMs, setCutoffMs] = useState(() => Date.now() - 30 * 60 * 1000);

  const loadCounts = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/portal-users");
      const body = (await res.json()) as { counts?: PortalCounts };
      if (res.ok && body.counts) setCounts(body.counts);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => void loadCounts(), 0);
    return () => window.clearTimeout(id);
  }, [loadCounts]);

  useEffect(() => {
    void Promise.allSettled([
      syncScheduleRecordsFromServer(),
      syncLeasePipelineFromServer(null),
    ]).then(() => {
      setCutoffMs(Date.now() - 30 * 60 * 1000);
      bump();
    });
    window.addEventListener(PROPERTY_PIPELINE_EVENT, bump);
    window.addEventListener(LEASE_PIPELINE_EVENT, bump);
    window.addEventListener(ADMIN_UI_EVENT, bump);
    window.addEventListener("storage", bump);
    return () => {
      window.removeEventListener(PROPERTY_PIPELINE_EVENT, bump);
      window.removeEventListener(LEASE_PIPELINE_EVENT, bump);
      window.removeEventListener(ADMIN_UI_EVENT, bump);
      window.removeEventListener("storage", bump);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const data = useMemo(() => {
    void tick;
    const [p0, , p2] = adminKpiCounts();
    const pendingProps = p0;
    const listedProps = p2;
    const totalProps = p0 + p2;

    const [managerBucket, adminBucket, residentBucket, signedBucket] = adminLeaseKpiCounts();
    const totalLeases = managerBucket + adminBucket + residentBucket + signedBucket;
    const leasesInAdminReview = adminBucket;

    const inboxUnread = readInboxMessages().filter((m) => m.folder === "inbox" && !m.read).length;

    const pendingMeetings = readPartnerInquiries()
      .filter((r) => r.status === "pending" && r.kind !== "tour")
      .flatMap((r) =>
        getPartnerInquiryWindows(r).map((w) => ({
          id: `${r.id}-${w.start}`,
          label: r.name,
          kind: "pending" as const,
          startMs: new Date(w.start).getTime(),
          start: w.start,
        })),
      );

    const confirmedMeetings = readPlannedEvents()
      .filter((e) => e.kind !== "tour")
      .map((e) => ({
        id: e.id,
        label: e.attendeeName ?? e.title ?? "Meeting",
        kind: "confirmed" as const,
        startMs: new Date(e.start).getTime(),
        start: e.start,
      }));

    const upcomingMeetings = [...pendingMeetings, ...confirmedMeetings]
      .filter((m) => Number.isFinite(m.startMs) && m.startMs >= cutoffMs)
      .sort((a, b) => a.startMs - b.startMs);

    const pendingTours = readPartnerInquiries()
      .filter((r) => r.kind === "tour" && r.status === "pending")
      .length;

    return {
      pendingProps,
      listedProps,
      totalProps,
      totalLeases,
      leasesInAdminReview,
      inboxUnread,
      upcomingMeetings,
      pendingMeetings: pendingMeetings.length,
      confirmedMeetings: confirmedMeetings.filter((m) => m.startMs >= cutoffMs).length,
      pendingTours,
      totalEvents: pendingInquiryCount() + readPlannedEvents().filter((e) => e.kind !== "tour").length,
    };
  }, [tick, cutoffMs]);

  const {
    pendingProps,
    totalProps,
    totalLeases,
    leasesInAdminReview,
    inboxUnread,
    upcomingMeetings,
    pendingMeetings,
    confirmedMeetings,
    pendingTours,
    totalEvents,
  } = data;

  const nextMeeting = upcomingMeetings[0] ?? null;
  const totalUsers = counts.managers + counts.residents + counts.owners;

  return (
    <div className={`${PORTAL_SECTION_SURFACE} space-y-5`}>
      <h1 className="text-[1.75rem] font-bold tracking-[-0.02em] text-slate-900">Dashboard</h1>

      {/* ── Action-required banners ── */}
      {(pendingProps > 0 || leasesInAdminReview > 0 || inboxUnread > 0 || pendingMeetings > 0 || pendingTours > 0) && (
        <div className="space-y-2">
          {pendingProps > 0 && (
            <NotifBanner tone="amber">
              <span>
                <span className="font-semibold">{pendingProps}</span> propert{pendingProps === 1 ? "y" : "ies"} pending your approval
              </span>
              <Link href="/admin/properties" className="shrink-0 font-semibold text-primary hover:underline underline-offset-2">
                Review →
              </Link>
            </NotifBanner>
          )}
          {leasesInAdminReview > 0 && (
            <NotifBanner tone="violet">
              <span>
                <span className="font-semibold">{leasesInAdminReview}</span> lease{leasesInAdminReview === 1 ? "" : "s"} in admin review
              </span>
              <Link href="/admin/leases" className="shrink-0 font-semibold text-primary hover:underline underline-offset-2">
                Review →
              </Link>
            </NotifBanner>
          )}
          {inboxUnread > 0 && (
            <NotifBanner tone="blue">
              <span>
                <span className="font-semibold">{inboxUnread}</span> unread message{inboxUnread === 1 ? "" : "s"} in admin inbox
              </span>
              <Link href="/admin/inbox/unopened" className="shrink-0 font-semibold text-primary hover:underline underline-offset-2">
                Open inbox →
              </Link>
            </NotifBanner>
          )}
          {pendingTours > 0 && (
            <NotifBanner tone="amber">
              <span>
                <span className="font-semibold">{pendingTours}</span> pending tour request{pendingTours === 1 ? "" : "s"} awaiting confirmation
              </span>
              <Link href="/admin/events" className="shrink-0 font-semibold text-primary hover:underline underline-offset-2">
                View →
              </Link>
            </NotifBanner>
          )}
          {pendingMeetings > 0 && (
            <NotifBanner tone="blue">
              <span>
                <span className="font-semibold">{pendingMeetings}</span> meeting request{pendingMeetings === 1 ? "" : "s"} need confirmation
              </span>
              <Link href="/admin/events" className="shrink-0 font-semibold text-primary hover:underline underline-offset-2">
                Confirm →
              </Link>
            </NotifBanner>
          )}
        </div>
      )}

      {/* ── KPI tiles ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Tile
          label="Properties"
          value={totalProps}
          sub={pendingProps > 0 ? `${pendingProps} pending approval` : undefined}
          href="/admin/properties"
          urgent={pendingProps > 0}
        />
        <Tile
          label="Leases"
          value={totalLeases}
          sub={leasesInAdminReview > 0 ? `${leasesInAdminReview} in admin review` : undefined}
          href="/admin/leases"
          urgent={leasesInAdminReview > 0}
        />
        <Tile
          label="Total users"
          value={totalUsers}
          sub={`${counts.managers}M · ${counts.residents}R · ${counts.owners}O`}
          href="/admin/axis-users"
        />
        <Tile
          label="Managers"
          value={counts.managers}
          href="/admin/axis-users"
        />
        <Tile
          label="Residents"
          value={counts.residents}
          href="/admin/axis-users"
        />
        <Tile
          label="Calendar events"
          value={totalEvents}
          sub={`${pendingMeetings} pending · ${confirmedMeetings} confirmed`}
          href="/admin/events"
          urgent={pendingMeetings > 0}
        />
      </div>

      {/* ── Upcoming meetings ── */}
      {upcomingMeetings.length > 0 && (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">Upcoming meetings</h2>
            <Link href="/admin/events" className="text-xs font-semibold text-primary hover:underline underline-offset-2">
              View all →
            </Link>
          </div>
          <ul className="mt-3 space-y-2">
            {upcomingMeetings.slice(0, 6).map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50/70 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{m.label}</p>
                  <p className="text-xs text-slate-500">{fmt(m.start)}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                  m.kind === "pending"
                    ? "bg-amber-100 text-amber-800"
                    : "bg-emerald-100 text-emerald-800"
                }`}>
                  {m.kind === "pending" ? "Pending" : "Confirmed"}
                </span>
              </li>
            ))}
          </ul>
          {nextMeeting && (
            <p className="mt-3 text-xs text-slate-500">
              Next: <span className="font-semibold text-slate-700">{nextMeeting.label}</span> at {fmt(nextMeeting.start)}
            </p>
          )}
        </div>
      )}

    </div>
  );
}
