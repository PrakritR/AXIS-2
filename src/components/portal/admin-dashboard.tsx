"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ManagerPortalPageShell,
  portalDashboardWelcomeSubtitle,
  PortalDashboardCompactRow,
  PortalDashboardPreviewList,
  PORTAL_DASHBOARD_SECTION_CARD,
  PORTAL_DASHBOARD_STACK,
} from "@/components/portal/portal-metrics";
import { formatPacificDateTime } from "@/lib/pacific-time";
import { readInboxMessages, syncInboxMessagesFromServer } from "@/lib/demo-admin-partner-inbox";
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
import { readBugFeedbackRows, syncBugFeedbackFromServer } from "@/lib/portal-bug-feedback";

function fmt(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "soon";
  return formatPacificDateTime(d);
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

export function AdminDashboard({ displayName = "there" }: { displayName?: string }) {
  const [tick, setTick] = useState(0);
  const bump = () => setTick((n) => n + 1);
  const [cutoffMs, setCutoffMs] = useState(() => Date.now() - 30 * 60 * 1000);

  useEffect(() => {
    let cancelled = false;

    void Promise.allSettled([
      syncScheduleRecordsFromServer(),
      syncPropertyPipelineFromServer(),
      syncInboxMessagesFromServer({ force: true }),
      syncBugFeedbackFromServer({ force: true }),
    ]).then(() => {
      if (cancelled) return;
      setCutoffMs(Date.now() - 30 * 60 * 1000);
      bump();
    });

    window.addEventListener(PROPERTY_PIPELINE_EVENT, bump);
    window.addEventListener(ADMIN_UI_EVENT, bump);
    window.addEventListener("storage", bump);
    return () => {
      cancelled = true;
      window.removeEventListener(PROPERTY_PIPELINE_EVENT, bump);
      window.removeEventListener(ADMIN_UI_EVENT, bump);
      window.removeEventListener("storage", bump);
    };
  }, []);

  const data = useMemo(() => {
    void tick;
    const [pendingProps, , listedProps] = adminKpiCounts();
    const totalProps = pendingProps + listedProps;

    const pendingPropertyRows = readAdminPropertyRows(0).slice(0, 5);

    const inboxMessages = readInboxMessages();
    const inboxUnread = inboxMessages.filter((m) => m.folder === "inbox" && !m.read).length;
    const inboxPreview = inboxMessages.filter((m) => m.folder === "inbox" && !m.read).slice(0, 5);

    const feedbackRows = readBugFeedbackRows();
    const feedbackTotal = feedbackRows.length;
    const openFeedbackAll = feedbackRows.filter((row) => row.status === "open" || row.status === "in_progress");
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
    const confirmedMeetingCount = readPlannedEvents().filter((e) => e.kind !== "tour").length;
    const totalMeetings = pendingMeetingCount + confirmedMeetingCount;

    return {
      pendingProps,
      totalProps,
      pendingPropertyRows,
      inboxUnread,
      inboxPreview,
      feedbackTotal,
      openFeedback,
      openFeedbackTotal: openFeedbackAll.length,
      upcomingMeetings: upcomingMeetings.slice(0, 5),
      pendingMeetingCount,
      totalMeetings,
    };
  }, [tick, cutoffMs]);

  const {
    pendingPropertyRows,
    inboxPreview,
    feedbackTotal,
    openFeedback,
    upcomingMeetings,
    pendingMeetingCount,
    totalMeetings,
  } = data;

  return (
    <ManagerPortalPageShell
      title="Dashboard"
      subtitle={portalDashboardWelcomeSubtitle(displayName)}
      hideTitleOnNative
    >
      <div className={PORTAL_DASHBOARD_STACK}>
        <div className="grid gap-4 lg:grid-cols-2 [html[data-native]_&]:gap-2.5">
        <div className={PORTAL_DASHBOARD_SECTION_CARD}>
          <SectionHeader title="Properties pending review" href="/admin/properties?tab=pending" linkLabel="Properties →" />
          <PortalDashboardPreviewList
            items={pendingPropertyRows}
            href="/admin/properties?tab=pending"
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
          <SectionHeader title="Meetings" href="/admin/events" linkLabel="Meetings →" />
          <PortalDashboardPreviewList
            items={upcomingMeetings}
            href="/admin/events"
            emptyMessage={
              pendingMeetingCount > 0
                ? `${pendingMeetingCount} pending request${pendingMeetingCount === 1 ? "" : "s"} — no upcoming times on the calendar.`
                : totalMeetings > 0
                  ? "No upcoming meetings on the calendar."
                  : "No meeting requests yet."
            }
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
                    {row.status === "in_progress" ? "In progress" : "Open"}
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
