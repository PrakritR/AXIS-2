"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PORTAL_DASHBOARD_TILE_LINK, PORTAL_KPI_LABEL, PORTAL_KPI_VALUE, PORTAL_SECTION_SURFACE } from "@/components/portal/portal-metrics";
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

function StatCard({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className={`${PORTAL_DASHBOARD_TILE_LINK} min-w-[10rem]`}
    >
      <p className={PORTAL_KPI_VALUE}>{value}</p>
      <p className={PORTAL_KPI_LABEL}>{label}</p>
    </Link>
  );
}

function formatUpcomingMeetingTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "soon";
  return d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function AdminDashboard() {
  const [eventsTotal, setEventsTotal] = useState("0");
  const [eventTick, setEventTick] = useState(0);
  const [counts, setCounts] = useState({ managers: 0, residents: 0, owners: 0 });
  const [propertiesTotal, setPropertiesTotal] = useState("0");
  const [pendingPropertyApprovals, setPendingPropertyApprovals] = useState("0");
  const [leaseReviewCount, setLeaseReviewCount] = useState("0");
  const [inboxUnread, setInboxUnread] = useState("0");

  const loadPortalUserCounts = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/portal-users");
      const body = (await res.json()) as {
        counts?: { managers: number; residents: number; owners: number };
      };
      if (!res.ok) return;
      if (body.counts) setCounts(body.counts);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => void loadPortalUserCounts(), 0);
    return () => window.clearTimeout(id);
  }, [loadPortalUserCounts]);

  const [adminMeetingCutoffMs, setAdminMeetingCutoffMs] = useState(() => Date.now() - 30 * 60 * 1000);
  useEffect(() => {
    const syncEvents = () => {
      const n = readPlannedEvents().filter((event) => event.kind !== "tour").length + pendingInquiryCount();
      setEventsTotal(String(n));
      setEventTick((tick) => tick + 1);
      setAdminMeetingCutoffMs(Date.now() - 30 * 60 * 1000);
    };
    syncEvents();
    void syncScheduleRecordsFromServer().then(syncEvents);
    const on = () => syncEvents();
    window.addEventListener(ADMIN_UI_EVENT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(ADMIN_UI_EVENT, on);
      window.removeEventListener("storage", on);
    };
  }, []);

  const upcomingAdminMeetings = useMemo(() => {
    void eventTick;
    const pending = readPartnerInquiries()
      .filter((row) => row.status === "pending" && row.kind !== "tour")
      .flatMap((row) =>
        getPartnerInquiryWindows(row).map((window) => ({
          id: `${row.id}-${window.start}`,
          label: row.name,
          status: "pending" as const,
          start: window.start,
          startMs: new Date(window.start).getTime(),
        })),
      );
    const confirmed = readPlannedEvents()
      .filter((event) => event.kind !== "tour")
      .map((event) => ({
        id: event.id,
        label: event.attendeeName ?? event.title,
        status: "confirmed" as const,
        start: event.start,
        startMs: new Date(event.start).getTime(),
      }));
    return [...pending, ...confirmed]
      .filter((meeting) => Number.isFinite(meeting.startMs) && meeting.startMs >= adminMeetingCutoffMs)
      .sort((a, b) => a.startMs - b.startMs);
  }, [eventTick, adminMeetingCutoffMs]);

  const nextAdminMeeting = upcomingAdminMeetings[0] ?? null;
  const pendingMeetingCount = upcomingAdminMeetings.filter((meeting) => meeting.status === "pending").length;
  const confirmedMeetingCount = upcomingAdminMeetings.filter((meeting) => meeting.status === "confirmed").length;

  useEffect(() => {
    const syncProperties = () => {
      const [p0, p1, p2, p3, p4] = adminKpiCounts();
      setPropertiesTotal(String(p0 + p1 + p2 + p3 + p4));
      setPendingPropertyApprovals(String(p0));
    };
    const syncLeases = () => {
      const [, adminBucket] = adminLeaseKpiCounts();
      setLeaseReviewCount(String(adminBucket));
    };
    const syncInbox = () => {
      const n = readInboxMessages().filter((m) => m.folder === "inbox" && !m.read).length;
      setInboxUnread(String(n));
    };
    const bumpOps = () => {
      syncProperties();
      syncLeases();
      syncInbox();
    };
    bumpOps();
    void syncLeasePipelineFromServer(null).then(() => syncLeases());
    window.addEventListener(PROPERTY_PIPELINE_EVENT, bumpOps);
    window.addEventListener(LEASE_PIPELINE_EVENT, bumpOps);
    window.addEventListener(ADMIN_UI_EVENT, bumpOps);
    window.addEventListener("storage", bumpOps);
    return () => {
      window.removeEventListener(PROPERTY_PIPELINE_EVENT, bumpOps);
      window.removeEventListener(LEASE_PIPELINE_EVENT, bumpOps);
      window.removeEventListener(ADMIN_UI_EVENT, bumpOps);
      window.removeEventListener("storage", bumpOps);
    };
  }, []);

  return (
    <div className={`${PORTAL_SECTION_SURFACE} space-y-5`}>
      <div className="flex items-center justify-between">
        <h1 className="text-[1.75rem] font-bold tracking-[-0.02em] text-slate-900">Dashboard</h1>
      </div>
      {nextAdminMeeting ? (
        <Link
          href="/admin/events"
          className="block rounded-2xl border border-sky-200/70 bg-gradient-to-br from-sky-50/90 to-white px-4 py-3.5 text-sm text-sky-950 shadow-[var(--shadow-sm)] transition hover:border-sky-300/90 hover:shadow-md"
        >
          <span className="font-semibold">{upcomingAdminMeetings.length} upcoming calendar item{upcomingAdminMeetings.length === 1 ? "" : "s"}:</span>{" "}
          {pendingMeetingCount} pending · {confirmedMeetingCount} confirmed. Next: {nextAdminMeeting.label} at{" "}
          <span className="font-semibold">{formatUpcomingMeetingTime(nextAdminMeeting.start)}</span>.
        </Link>
      ) : null}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Properties" value={propertiesTotal} href="/admin/properties" />
        <StatCard label="Pending review" value={pendingPropertyApprovals} href="/admin/properties" />
        <StatCard label="Leases in review" value={leaseReviewCount} href="/admin/leases" />
        <StatCard label="Users" value={String(counts.managers + counts.owners + counts.residents)} href="/admin/axis-users" />
        <StatCard label="Calendar" value={eventsTotal} href="/admin/events" />
        <StatCard label="Inbox unread" value={inboxUnread} href="/admin/inbox/unopened" />
      </div>
    </div>
  );
}
