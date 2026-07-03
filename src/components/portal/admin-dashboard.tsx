"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PORTAL_SECTION_SURFACE } from "@/components/portal/portal-metrics";
import {
  PortalDashboardCompactRow,
  PortalDashboardPreviewList,
  PORTAL_DASHBOARD_SECTION_CARD,
  PORTAL_DASHBOARD_STACK,
  formatCompactPlacementLine,
} from "@/components/portal/portal-metrics";
import { formatPacificDateTime } from "@/lib/pacific-time";
import { isDemoModeActive } from "@/lib/demo/demo-session";
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
import { readBugFeedbackRows, syncBugFeedbackFromServer } from "@/lib/portal-bug-feedback";

type PortalCounts = { managers: number; residents: number };

function fmt(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "soon";
  return formatPacificDateTime(d);
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
      className={`surface-panel group flex flex-col gap-1 rounded-2xl border p-5 shadow-[var(--shadow-sm)] transition hover:shadow-[var(--shadow-card)] ${
        urgent ? "border-[var(--status-pending-bg)] ring-1 ring-[var(--status-pending-bg)]" : "border-border hover:border-primary/25"
      }`}
    >
      <p className="text-[2rem] font-bold leading-none tracking-[-0.03em] text-foreground">{value}</p>
      <p className="text-sm font-medium text-muted">{label}</p>
      {sub ? <p className="text-xs text-muted">{sub}</p> : null}
    </Link>
  );
}

function SectionHeader({ title, href, linkLabel }: { title: string; href?: string; linkLabel?: string }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-muted">{title}</h2>
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
    if (isDemoModeActive()) return;
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
    const feedbackTotal = feedbackRows.length;
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
      feedbackTotal,
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
    adminReviewLeases,
    pendingPropertyRows,
    inboxPreview,
    feedbackTotal,
    openFeedback,
    upcomingMeetings,
    pendingMeetingCount,
    totalMeetings,
    confirmedMeetings,
  } = data;

  const totalUsers = counts.managers + counts.residents;

  return (
    <div className={`${PORTAL_SECTION_SURFACE} ${PORTAL_DASHBOARD_STACK}`}>
      <h1 className="text-[1.75rem] font-bold tracking-[-0.02em] text-foreground [html[data-native]_&]:text-[1.2rem]">Dashboard</h1>

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

      <div className="grid gap-4 lg:grid-cols-2 [html[data-native]_&]:gap-2.5">
        <div className={PORTAL_DASHBOARD_SECTION_CARD}>
          <SectionHeader title="Properties pending review" href="/admin/properties" linkLabel="Properties →" />
          <PortalDashboardPreviewList
            items={pendingPropertyRows}
            href="/admin/properties"
            emptyMessage="No properties waiting for admin review."
            keyForItem={(row) => row.adminRefId}
            renderRow={(row) => (
              <PortalDashboardCompactRow
                title={row.buildingName || row.unitLabel || "Listing"}
                subtitle={row.address || row.neighborhood || "Pending submission"}
                badge={
                  <span className="portal-badge-pending rounded-full px-2 py-0.5 text-[10px] font-semibold">Review</span>
                }
              />
            )}
          />
        </div>

        <div className={PORTAL_DASHBOARD_SECTION_CARD}>
          <SectionHeader title="Leases in admin review" href="/admin/leases" linkLabel="Leases →" />
          <PortalDashboardPreviewList
            items={adminReviewLeases}
            href="/admin/leases"
            emptyMessage="No leases waiting for admin review."
            keyForItem={(row) => row.id}
            renderRow={(row) => (
              <PortalDashboardCompactRow
                title={row.residentName || row.residentEmail}
                subtitle={formatCompactPlacementLine(row.unit || row.stageLabel || "Unit pending", row.signedRentLabel || "Rent pending")}
                badge={
                  <span className="portal-badge-info rounded-full px-2 py-0.5 text-[10px] font-semibold">Admin review</span>
                }
              />
            )}
          />
        </div>

        <div className={PORTAL_DASHBOARD_SECTION_CARD}>
          <SectionHeader title="Inbox" href="/admin/inbox/unopened" linkLabel="Inbox →" />
          <PortalDashboardPreviewList
            items={inboxPreview}
            href="/admin/inbox/unopened"
            emptyMessage="No unread messages — inbox is clear."
            keyForItem={(message) => message.id}
            renderRow={(message) => (
              <PortalDashboardCompactRow
                title={message.name || message.email}
                subtitle={message.topic || message.body.slice(0, 80)}
                badge={
                  <span className="portal-badge-info rounded-full px-2 py-0.5 text-[10px] font-semibold">Unread</span>
                }
              />
            )}
          />
        </div>

        <div className={PORTAL_DASHBOARD_SECTION_CARD}>
          <SectionHeader title="Feedback" href="/admin/bugs-feedback" linkLabel="Feedback →" />
          <PortalDashboardPreviewList
            items={openFeedback}
            href="/admin/bugs-feedback"
            emptyMessage={`No open feedback — ${feedbackTotal} submission${feedbackTotal === 1 ? "" : "s"} on file.`}
            keyForItem={(row) => row.id}
            renderRow={(row) => (
              <PortalDashboardCompactRow
                title={row.title || "Untitled report"}
                subtitle={`${row.reporterName || row.reporterEmail} · ${row.type === "bug" ? "Bug" : "Feedback"}`}
                badge={
                  <span className="portal-badge-pending rounded-full px-2 py-0.5 text-[10px] font-semibold">
                    {row.status === "reviewing" ? "Reviewing" : "Open"}
                  </span>
                }
              />
            )}
          />
        </div>
      </div>

      {upcomingMeetings.length > 0 && (
        <div className={PORTAL_DASHBOARD_SECTION_CARD}>
          <SectionHeader title="Upcoming meetings" href="/admin/events" linkLabel="Meetings →" />
          <PortalDashboardPreviewList
            items={upcomingMeetings}
            href="/admin/events"
            emptyMessage="No upcoming meetings."
            keyForItem={(m) => m.id}
            renderRow={(m) => (
              <PortalDashboardCompactRow
                title={m.label}
                subtitle={fmt(m.start)}
                badge={
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      m.kind === "pending" ? "portal-badge-pending" : "portal-badge-success"
                    }`}
                  >
                    {m.kind === "pending" ? "Pending" : "Confirmed"}
                  </span>
                }
              />
            )}
          />
        </div>
      )}
    </div>
  );
}
