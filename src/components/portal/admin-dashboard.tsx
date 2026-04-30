"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PORTAL_KPI_LABEL, PORTAL_KPI_VALUE, PORTAL_SECTION_SURFACE } from "@/components/portal/portal-metrics";
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
      className="block min-w-[10rem] rounded-xl border border-slate-200/80 bg-white px-5 py-4 transition hover:border-primary/35 hover:shadow-sm"
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
    };
    syncProperties();
    window.addEventListener(PROPERTY_PIPELINE_EVENT, syncProperties);
    window.addEventListener("storage", syncProperties);
    return () => {
      window.removeEventListener(PROPERTY_PIPELINE_EVENT, syncProperties);
      window.removeEventListener("storage", syncProperties);
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className={PORTAL_SECTION_SURFACE}>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Dashboard</h1>
        {nextAdminMeeting ? (
          <Link
            href="/admin/events"
            className="mt-4 block rounded-2xl border border-sky-200/80 bg-sky-50/80 px-4 py-3 text-sm text-sky-950 transition hover:border-sky-300 hover:bg-sky-50"
          >
            <span className="font-semibold">{upcomingAdminMeetings.length} upcoming calendar item{upcomingAdminMeetings.length === 1 ? "" : "s"}:</span>{" "}
            {pendingMeetingCount} pending · {confirmedMeetingCount} confirmed. Next: {nextAdminMeeting.label} at{" "}
            <span className="font-semibold">{formatUpcomingMeetingTime(nextAdminMeeting.start)}</span>.
          </Link>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Properties" value={propertiesTotal} href="/admin/properties" />
        <StatCard
          label="Axis users"
          value={String(counts.managers + counts.owners + counts.residents)}
          href="/admin/axis-users"
        />
        <StatCard label="Calendar" value={eventsTotal} href="/admin/events" />
      </div>
    </div>
  );
}
