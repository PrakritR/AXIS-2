"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PORTAL_SECTION_SURFACE } from "@/components/portal/portal-metrics";
import { formatPacificDateTime } from "@/lib/pacific-time";
import { readInboxMessages, syncInboxMessagesFromServer } from "@/lib/demo-admin-partner-inbox";
import { adminLeaseKpiCounts } from "@/lib/demo-admin-leases";
import { adminKpiCounts, readAdminPropertyRows } from "@/lib/demo-admin-property-inventory";
import {
  getPartnerInquiryWindows,
  pendingInquiryCount,
  readPartnerInquiries,
  readPlannedEvents,
  syncScheduleRecordsFromServer,
} from "@/lib/demo-admin-scheduling";
import { ADMIN_UI_EVENT } from "@/lib/demo-admin-ui";
import { PROPERTY_PIPELINE_EVENT, syncPropertyPipelineFromServer } from "@/lib/demo-property-pipeline";
import {
  LEASE_PIPELINE_EVENT,
  readLeasePipeline,
  syncLeasePipelineFromServer,
} from "@/lib/lease-pipeline-storage";
import { syncHouseholdChargesFromServer } from "@/lib/household-charges";
import { readBugFeedbackRows, syncBugFeedbackFromServer } from "@/lib/portal-bug-feedback";
import { countBugFeedbackTabs } from "@/lib/portal-bug-feedback-utils";

type PortalCounts = { managers: number; residents: number };

function fmt(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "soon";
  return formatPacificDateTime(d);
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

export function AdminDashboard() {
  const [tick, setTick] = useState(0);
  const bump = () => setTick((n) => n + 1);
  const [counts, setCounts] = useState<PortalCounts>({ managers: 0, residents: 0 });
  const [cutoffMs, setCutoffMs] = useState(() => Date.now() - 30 * 60 * 1000);

  const loadCounts = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/portal-users");
      const body = (await res.json()) as { counts?: PortalCounts };
      if (res.ok && body.counts) setCounts(body.counts);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => void loadCounts(), 0);
    return () => window.clearTimeout(id);
  }, [loadCounts]);

  useEffect(() => {
    let cancelled = false;

    void Promise.allSettled([
      syncScheduleRecordsFromServer(),
      syncLeasePipelineFromServer(null),
      syncPropertyPipelineFromServer(),
      syncInboxMessagesFromServer({ force: true }),
      syncBugFeedbackFromServer({ force: true }),
    ]).then(() => {
      if (cancelled) return;
      setCutoffMs(Date.now() - 30 * 60 * 1000);
      bump();
    });

    window.addEventListener(PROPERTY_PIPELINE_EVENT, bump);
    window.addEventListener(LEASE_PIPELINE_EVENT, bump);
    window.addEventListener(ADMIN_UI_EVENT, bump);
    window.addEventListener("storage", bump);
    return () => {
      cancelled = true;
      window.removeEventListener(PROPERTY_PIPELINE_EVENT, bump);
      window.removeEventListener(LEASE_PIPELINE_EVENT, bump);
      window.removeEventListener(ADMIN_UI_EVENT, bump);
      window.removeEventListener("storage", bump);
    };
  }, []);

  const data = useMemo(() => {
    void tick;
    const [pendingProps, , listedProps] = adminKpiCounts();
    const totalProps = pendingProps + listedProps;

    const [, adminBucket] = adminLeaseKpiCounts();
    const leasesInAdminReview = adminBucket;
    const adminReviewLeases = readLeasePipeline()
      .filter((row) => row.bucket === "admin")
      .slice(0, 5);

    const pendingPropertyRows = readAdminPropertyRows(0).slice(0, 5);

    const inboxMessages = readInboxMessages();
    const inboxUnread = inboxMessages.filter((m) => m.folder === "inbox" && !m.read).length;
    const inboxPreview = inboxMessages.filter((m) => m.folder === "inbox" && !m.read).slice(0, 5);

    const feedbackRows = readBugFeedbackRows();
    const feedbackCounts = countBugFeedbackTabs(feedbackRows);
    const openFeedbackAll = feedbackRows.filter((row) => row.status === "open" || row.status === "reviewing");
    const openFeedback = openFeedbackAll.slice(0, 5);

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

    const pendingMeetingCount = pendingInquiryCount();
    const totalMeetings = pendingMeetingCount + readPlannedEvents().filter((e) => e.kind !== "tour").length;

    return {
      pendingProps,
      totalProps,
      leasesInAdminReview,
      adminReviewLeases,
      pendingPropertyRows,
      inboxUnread,
      inboxPreview,
      feedbackCounts,
      openFeedback,
      openFeedbackTotal: openFeedbackAll.length,
      upcomingMeetings,
      pendingMeetingCount,
      totalMeetings,
      confirmedMeetings: confirmedMeetings.filter((m) => m.startMs >= cutoffMs).length,
    };
  }, [tick, cutoffMs]);

  const {
    pendingProps,
    totalProps,
    leasesInAdminReview,
    adminReviewLeases,
    pendingPropertyRows,
    inboxUnread,
    inboxPreview,
    feedbackCounts,
    openFeedback,
    openFeedbackTotal,
    upcomingMeetings,
    pendingMeetingCount,
    totalMeetings,
    confirmedMeetings,
  } = data;

  const totalUsers = counts.managers + counts.residents;
  const openFeedbackCount = openFeedbackTotal;
  const hasBanners =
    pendingProps > 0 || leasesInAdminReview > 0 || inboxUnread > 0 || pendingMeetingCount > 0 || openFeedbackCount > 0;

  return (
    <div className={`${PORTAL_SECTION_SURFACE} space-y-5`}>
      <h1 className="text-[1.75rem] font-bold tracking-[-0.02em] text-slate-900">Dashboard</h1>

      {hasBanners && (
        <div className="space-y-2">
          {pendingProps > 0 && (
            <NotifBanner tone="amber">
              <span>
                <span className="font-semibold">{pendingProps}</span> propert{pendingProps === 1 ? "y" : "ies"} pending your approval
              </span>
              <Link href="/admin/properties" className="shrink-0 font-semibold text-primary hover:underline underline-offset-2">
                Properties →
              </Link>
            </NotifBanner>
          )}
          {leasesInAdminReview > 0 && (
            <NotifBanner tone="violet">
              <span>
                <span className="font-semibold">{leasesInAdminReview}</span> lease{leasesInAdminReview === 1 ? "" : "s"} in admin review
              </span>
              <Link href="/admin/leases" className="shrink-0 font-semibold text-primary hover:underline underline-offset-2">
                Leases →
              </Link>
            </NotifBanner>
          )}
          {inboxUnread > 0 && (
            <NotifBanner tone="blue">
              <span>
                <span className="font-semibold">{inboxUnread}</span> unread message{inboxUnread === 1 ? "" : "s"} in admin inbox
              </span>
              <Link href="/admin/inbox/unopened" className="shrink-0 font-semibold text-primary hover:underline underline-offset-2">
                Inbox →
              </Link>
            </NotifBanner>
          )}
          {pendingMeetingCount > 0 && (
            <NotifBanner tone="blue">
              <span>
                <span className="font-semibold">{pendingMeetingCount}</span> meeting request{pendingMeetingCount === 1 ? "" : "s"} need confirmation
              </span>
              <Link href="/admin/events" className="shrink-0 font-semibold text-primary hover:underline underline-offset-2">
                Meetings →
              </Link>
            </NotifBanner>
          )}
          {openFeedbackCount > 0 && (
            <NotifBanner tone="rose">
              <span>
                <span className="font-semibold">{openFeedbackCount}</span> open bug{openFeedbackCount === 1 ? "" : "s"} or feedback item{openFeedbackCount === 1 ? "" : "s"} to review
              </span>
              <Link href="/admin/bugs-feedback/bugs" className="shrink-0 font-semibold text-primary hover:underline underline-offset-2">
                Feedback →
              </Link>
            </NotifBanner>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Tile
          label="Properties"
          value={totalProps}
          sub={pendingProps > 0 ? `${pendingProps} pending approval` : undefined}
          href="/admin/properties"
          urgent={pendingProps > 0}
        />
        <Tile
          label="Total users"
          value={totalUsers}
          sub={`${counts.managers} managers · ${counts.residents} residents`}
          href="/admin/axis-users"
        />
        <Tile
          label="Meetings"
          value={totalMeetings}
          sub={`${pendingMeetingCount} pending · ${confirmedMeetings} confirmed`}
          href="/admin/events"
          urgent={pendingMeetingCount > 0}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
          <SectionHeader title="Properties pending review" href="/admin/properties" linkLabel="Properties →" />
          {pendingPropertyRows.length === 0 ? (
            <p className="mt-4 text-sm text-slate-400">No properties waiting for admin review.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {pendingPropertyRows.map((row) => (
                <li key={row.adminRefId} className="flex items-start justify-between gap-3 rounded-xl bg-slate-50/70 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {row.buildingName || row.unitLabel || "Listing"}
                    </p>
                    <p className="truncate text-xs text-slate-500">{row.address || row.neighborhood || "Pending submission"}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-semibold text-amber-800">
                    Review
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
          <SectionHeader title="Leases in admin review" href="/admin/leases" linkLabel="Leases →" />
          {adminReviewLeases.length === 0 ? (
            <p className="mt-4 text-sm text-slate-400">No leases waiting for admin review.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {adminReviewLeases.map((row) => (
                <li key={row.id} className="flex items-start justify-between gap-3 rounded-xl bg-slate-50/70 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{row.residentName || row.residentEmail}</p>
                    <p className="truncate text-xs text-slate-500">
                      {row.unit || row.stageLabel || "Unit pending"} · {row.signedRentLabel || "Rent pending"}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-violet-100 px-2.5 py-0.5 text-[10px] font-semibold text-violet-800">
                    Admin review
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
          <SectionHeader title="Inbox" href="/admin/inbox/unopened" linkLabel="Inbox →" />
          {inboxUnread === 0 ? (
            <p className="mt-4 text-sm text-slate-400">No unread messages — inbox is clear.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {inboxPreview.map((message) => (
                <li key={message.id} className="flex items-start justify-between gap-3 rounded-xl bg-slate-50/70 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{message.name || message.email}</p>
                    <p className="truncate text-xs text-slate-500">{message.topic || message.body.slice(0, 80)}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-blue-100 px-2.5 py-0.5 text-[10px] font-semibold text-blue-800">
                    Unread
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
          <SectionHeader title="Feedback" href="/admin/bugs-feedback/bugs" linkLabel="Feedback →" />
          {openFeedback.length === 0 ? (
            <p className="mt-4 text-sm text-slate-400">
              No open bugs or feedback — {feedbackCounts.bugs} bug{feedbackCounts.bugs === 1 ? "" : "s"} and {feedbackCounts.feedback} feedback item{feedbackCounts.feedback === 1 ? "" : "s"} on file.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {openFeedback.map((row) => (
                <li key={row.id} className="flex items-start justify-between gap-3 rounded-xl bg-slate-50/70 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{row.title || "Untitled report"}</p>
                    <p className="truncate text-xs text-slate-500">
                      {row.reporterName || row.reporterEmail} · {row.type === "bug" ? "Bug" : "Feedback"}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-rose-100 px-2.5 py-0.5 text-[10px] font-semibold text-rose-800">
                    {row.status === "reviewing" ? "Reviewing" : "Open"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {upcomingMeetings.length > 0 && (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
          <SectionHeader title="Upcoming meetings" href="/admin/events" linkLabel="Meetings →" />
          <ul className="mt-3 space-y-2">
            {upcomingMeetings.slice(0, 6).map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50/70 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{m.label}</p>
                  <p className="text-xs text-slate-500">{fmt(m.start)}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                    m.kind === "pending" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
                  }`}
                >
                  {m.kind === "pending" ? "Pending" : "Confirmed"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
