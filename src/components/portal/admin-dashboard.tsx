"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppUi } from "@/components/providers/app-ui-provider";
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

const launchPreviewClassName =
  "inline-flex items-center justify-center rounded-full px-4 py-2 text-[13px] font-semibold text-white shadow-[0_0_18px_rgba(0,122,255,0.22)] outline-none transition hover:-translate-y-0.5 hover:shadow-[0_0_22px_rgba(0,122,255,0.32)] active:translate-y-px";

type PreviewPortal = "manager" | "owner" | "resident";
type PortalUser = { id: string; label: string; name?: string; email?: string };
type PreviewShortcut = { label: string; path: string };

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

function PreviewPortalCard({
  title,
  description,
  portal,
  users,
  selectedId,
  launchingPortal,
  onSelect,
  onOpen,
  shortcuts,
}: {
  title: string;
  description: string;
  portal: PreviewPortal;
  users: PortalUser[];
  selectedId: string;
  launchingPortal: PreviewPortal | null;
  onSelect: (id: string) => void;
  onOpen: (portal: PreviewPortal, id: string, path: string) => void;
  shortcuts: PreviewShortcut[];
}) {
  const selected = users.find((user) => user.id === selectedId);
  const disabled = !selectedId || launchingPortal !== null;

  return (
    <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{title}</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{users.length}</span>
      </div>
      <select
        aria-label={`${title} preview`}
        className="mt-4 h-11 w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-4 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/30"
        value={selectedId}
        onChange={(e) => onSelect(e.target.value)}
      >
        <option value="">Choose account</option>
        {users.map((user) => (
          <option key={user.id} value={user.id}>
            {user.label}
          </option>
        ))}
      </select>
      {selected ? (
        <div className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">
          <p className="font-semibold text-slate-900">{selected.name || selected.label}</p>
          {selected.email ? <p>{selected.email}</p> : null}
          <p className="font-mono text-[11px] text-slate-500">{selected.id}</p>
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        {shortcuts.map((shortcut, idx) => (
          <button
            key={shortcut.path}
            type="button"
            disabled={disabled}
            onClick={() => onOpen(portal, selectedId, shortcut.path)}
            className={`${idx === 0 ? launchPreviewClassName : "rounded-full border border-slate-200 bg-white px-4 py-2 text-[13px] font-semibold text-slate-700 transition hover:border-primary/30 hover:text-primary"} disabled:pointer-events-none disabled:opacity-50`}
            style={idx === 0 ? { background: "linear-gradient(135deg, var(--primary), var(--primary-alt))" } : undefined}
          >
            {launchingPortal === portal && idx === 0 ? "Opening..." : shortcut.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function AdminDashboard() {
  const router = useRouter();
  const { showToast } = useAppUi();
  const [eventsTotal, setEventsTotal] = useState("0");
  const [eventTick, setEventTick] = useState(0);
  const [managers, setManagers] = useState<PortalUser[]>([]);
  const [owners, setOwners] = useState<PortalUser[]>([]);
  const [residents, setResidents] = useState<PortalUser[]>([]);
  const [counts, setCounts] = useState({ managers: 0, residents: 0, owners: 0 });
  const [propertiesTotal, setPropertiesTotal] = useState("0");
  const [managerId, setManagerId] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [residentId, setResidentId] = useState("");
  const [launchingPortal, setLaunchingPortal] = useState<PreviewPortal | null>(null);

  const goPreview = useCallback(
    async (portal: PreviewPortal, id: string, path: string) => {
      if (!id || launchingPortal) return;
      setLaunchingPortal(portal);
      try {
        const res = await fetch("/api/admin/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetUserId: id, portal }),
        });
        const body = (await res.json()) as { error?: string };
        if (!res.ok) {
          showToast(body.error ?? "Could not start preview.");
          return;
        }
        router.push(path);
        router.refresh();
      } catch {
        showToast("Network error.");
      } finally {
        setLaunchingPortal(null);
      }
    },
    [launchingPortal, router, showToast],
  );

  const loadPortalUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/portal-users");
      const body = (await res.json()) as {
        managers?: PortalUser[];
        owners?: PortalUser[];
        residents?: PortalUser[];
        counts?: { managers: number; residents: number; owners: number };
        error?: string;
      };
      if (!res.ok) return;
      setManagers(body.managers ?? []);
      setOwners(body.owners ?? []);
      setResidents(body.residents ?? []);
      if (body.counts) setCounts(body.counts);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => void loadPortalUsers(), 0);
    return () => window.clearTimeout(id);
  }, [loadPortalUsers]);

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
        <div className="mt-6">
          <div className="mb-4 rounded-2xl border border-amber-200/80 bg-amber-50/70 px-4 py-3 text-sm leading-6 text-amber-950">
            Choose an account below to view the portal using that user&apos;s data. The amber preview banner stays visible so you know you are
            looking as someone else.
          </div>
          <div className="grid gap-4 xl:grid-cols-3">
            <PreviewPortalCard
              title="Property team"
              description="Managers see properties, applications, residents, leases, work orders, calendar, account links, inbox, plan, and profile."
              portal="manager"
              users={managers}
              selectedId={managerId}
              launchingPortal={launchingPortal}
              onSelect={setManagerId}
              onOpen={(portal, id, path) => void goPreview(portal, id, path)}
              shortcuts={[
                { label: "Open dashboard", path: "/portal/dashboard" },
                { label: "Applications", path: "/portal/applications" },
                { label: "Leases", path: "/portal/leases" },
              ]}
            />
            <PreviewPortalCard
              title="Property owner"
              description="Owners use the same property portal surface, scoped to the houses and records linked to that owner account."
              portal="owner"
              users={owners}
              selectedId={ownerId}
              launchingPortal={launchingPortal}
              onSelect={setOwnerId}
              onOpen={(portal, id, path) => void goPreview(portal, id, path)}
              shortcuts={[
                { label: "Open dashboard", path: "/portal/dashboard" },
                { label: "Properties", path: "/portal/properties" },
                { label: "Inbox", path: "/portal/inbox/unopened" },
              ]}
            />
            <PreviewPortalCard
              title="Resident"
              description="Residents see their resident dashboard, lease, application, payments, inbox, maintenance, calendar, and profile."
              portal="resident"
              users={residents}
              selectedId={residentId}
              launchingPortal={launchingPortal}
              onSelect={setResidentId}
              onOpen={(portal, id, path) => void goPreview(portal, id, path)}
              shortcuts={[
                { label: "Open dashboard", path: "/resident/dashboard" },
                { label: "Payments", path: "/resident/payments" },
                { label: "Inbox", path: "/resident/inbox/unopened" },
                { label: "Profile", path: "/resident/profile" },
              ]}
            />
          </div>
        </div>
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
