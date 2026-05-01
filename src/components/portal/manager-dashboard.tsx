"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import type { DemoApplicantRow, DemoManagerWorkOrderRow } from "@/data/demo-portal";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import { adminKpiCounts } from "@/lib/demo-admin-property-inventory";
import { getPartnerInquiryWindows, readPartnerInquiries, readPlannedEvents, syncScheduleRecordsFromServer } from "@/lib/demo-admin-scheduling";
import { ADMIN_UI_EVENT } from "@/lib/demo-admin-ui";
import { PROPERTY_PIPELINE_EVENT } from "@/lib/demo-property-pipeline";
import { LEASE_PIPELINE_EVENT, readLeasePipeline, syncLeasePipelineFromServer } from "@/lib/lease-pipeline-storage";
import { MANAGER_APPLICATIONS_EVENT, readManagerApplicationRows, syncManagerApplicationsFromServer } from "@/lib/manager-applications-storage";
import { applicationVisibleToPortalUser, collectAccessiblePropertyIds } from "@/lib/manager-portfolio-access";
import { readManagerWorkOrderRows, subscribeManagerWorkOrders, syncManagerWorkOrdersFromServer } from "@/lib/manager-work-orders-storage";
import { ManagerPortalPageShell, PORTAL_DASHBOARD_TILE_LINK, PORTAL_KPI_LABEL, PORTAL_KPI_VALUE } from "@/components/portal/portal-metrics";
import { PortalPropertyFilter } from "./manager-section-shell";

function safeLeasePipelineCount(userId: string | null): number {
  try {
    if (!userId) return 0;
    return readLeasePipeline(userId).length;
  } catch {
    return 0;
  }
}

function workOrderVisibleToManager(row: DemoManagerWorkOrderRow, userId: string | null): boolean {
  if (!userId) return false;
  const scoped = row.managerUserId?.trim();
  if (scoped) return scoped === userId;
  const pid = row.propertyId?.trim() || row.assignedPropertyId?.trim();
  if (pid) return collectAccessiblePropertyIds(userId).has(pid);
  return false;
}

function formatUpcomingTourTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "soon";
  return d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function StatLink({ label, value, href }: { label: string; value: string; href: string }) {
  return (
    <Link
      href={href}
      className={PORTAL_DASHBOARD_TILE_LINK}
    >
      <p className={PORTAL_KPI_VALUE}>{value}</p>
      <p className={PORTAL_KPI_LABEL}>{label}</p>
    </Link>
  );
}

export function ManagerDashboard() {
  const { showToast } = useAppUi();
  const portalBase = "/portal";
  const { userId } = useManagerUserId();

  const [pipelineTick, setPipelineTick] = useState(0);
  useEffect(() => {
    const on = () => setPipelineTick((n) => n + 1);
    void syncManagerApplicationsFromServer().then(on);
    window.addEventListener(PROPERTY_PIPELINE_EVENT, on);
    return () => {
      window.removeEventListener(PROPERTY_PIPELINE_EVENT, on);
    };
  }, []);

  const [tourTick, setTourTick] = useState(0);
  const [tourCutoffMs, setTourCutoffMs] = useState(() => Date.now() - 30 * 60 * 1000);
  useEffect(() => {
    const on = () => {
      setTourTick((n) => n + 1);
      setTourCutoffMs(Date.now() - 30 * 60 * 1000);
    };
    void syncScheduleRecordsFromServer().then(on);
    window.addEventListener(ADMIN_UI_EVENT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(ADMIN_UI_EVENT, on);
      window.removeEventListener("storage", on);
    };
  }, []);

  const upcomingTours = useMemo(() => {
    void tourTick;
    if (!userId) return [];
    const pending = readPartnerInquiries()
      .filter((row) => row.kind === "tour" && row.status === "pending" && row.managerUserId === userId)
      .flatMap((row) =>
        getPartnerInquiryWindows(row).map((window) => ({
          id: `${row.id}-${window.start}`,
          label: row.name,
          propertyTitle: row.propertyTitle,
          roomLabel: row.roomLabel,
          status: "pending" as const,
          start: window.start,
          startMs: new Date(window.start).getTime(),
        })),
      );
    const confirmed = readPlannedEvents()
      .filter((event) => event.kind === "tour" && event.managerUserId === userId)
      .map((event) => ({
        id: event.id,
        label: event.attendeeName ?? "Confirmed tour",
        propertyTitle: event.propertyTitle,
        roomLabel: event.roomLabel,
        status: "confirmed" as const,
        start: event.start,
        startMs: new Date(event.start).getTime(),
      }));
    return [...pending, ...confirmed]
      .filter((tour) => Number.isFinite(tour.startMs) && tour.startMs >= tourCutoffMs)
      .sort((a, b) => a.startMs - b.startMs);
  }, [userId, tourTick, tourCutoffMs]);

  const upcomingTour = upcomingTours[0] ?? null;

  const pipelineSummary = useMemo(() => {
    void pipelineTick;
    try {
      if (!userId) {
        return {
          pendingProperties: 0,
          totalProperties: 0,
        };
      }
      const [p0, p1, p2, p3, p4] = adminKpiCounts(userId);
      return {
        pendingProperties: p0,
        totalProperties: p0 + p1 + p2 + p3 + p4,
      };
    } catch {
      return { pendingProperties: 0, totalProperties: 0 };
    }
  }, [userId, pipelineTick]);

  const [applicationRows, setApplicationRows] = useState<DemoApplicantRow[]>([]);
  useEffect(() => {
    const sync = () => setApplicationRows(readManagerApplicationRows());
    sync();
    void syncManagerApplicationsFromServer().then(sync);
    window.addEventListener(MANAGER_APPLICATIONS_EVENT, sync);
    return () => {
      window.removeEventListener(MANAGER_APPLICATIONS_EVENT, sync);
    };
  }, []);

  const visibleApplications = useMemo(() => {
    if (!userId) return [];
    return applicationRows.filter((a) => applicationVisibleToPortalUser(a, userId));
  }, [applicationRows, userId]);

  const pendingApplications = visibleApplications.filter((a) => a.bucket === "pending").length;

  const [leaseTick, setLeaseTick] = useState(0);
  useEffect(() => {
    const on = () => setLeaseTick((n) => n + 1);
    void syncLeasePipelineFromServer(userId).then(on);
    window.addEventListener(LEASE_PIPELINE_EVENT, on);
    window.addEventListener(MANAGER_APPLICATIONS_EVENT, on);
    return () => {
      window.removeEventListener(LEASE_PIPELINE_EVENT, on);
      window.removeEventListener(MANAGER_APPLICATIONS_EVENT, on);
    };
  }, [userId]);

  const leasePipelineCount = useMemo(() => {
    void leaseTick;
    return safeLeasePipelineCount(userId);
  }, [leaseTick, userId]);

  const [workOrderRows, setWorkOrderRows] = useState<DemoManagerWorkOrderRow[]>([]);
  useEffect(() => {
    const sync = () => setWorkOrderRows(readManagerWorkOrderRows());
    sync();
    void syncManagerWorkOrdersFromServer().then(sync);
    const sub = subscribeManagerWorkOrders(sync);
    return () => sub();
  }, []);

  const scopedWorkOrders = useMemo(() => {
    if (!userId) return [];
    return workOrderRows.filter((r) => workOrderVisibleToManager(r, userId));
  }, [workOrderRows, userId]);

  const openWorkOrders = useMemo(
    () => scopedWorkOrders.filter((r) => r.bucket === "open" || r.bucket === "scheduled").length,
    [scopedWorkOrders],
  );

  return (
    <ManagerPortalPageShell
      title="Dashboard"
      titleAside={
        <>
          <div className="hidden sm:block">
            <PortalPropertyFilter />
          </div>
          <Button type="button" variant="outline" className="shrink-0 rounded-full" onClick={() => showToast("Dashboard refreshed.")}>
            Refresh
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {upcomingTour ? (
          <p className="rounded-2xl border border-yellow-200/80 bg-yellow-50/70 px-4 py-3 text-sm text-yellow-950">
            Next tour: <span className="font-semibold">{formatUpcomingTourTime(upcomingTour.start)}</span>.{" "}
            <Link className="font-semibold text-primary underline-offset-2 hover:underline" href={`${portalBase}/calendar`}>
              Open calendar
            </Link>
          </p>
        ) : null}
        {pipelineSummary.pendingProperties > 0 || pendingApplications > 0 ? (
          <p className="rounded-2xl border border-amber-200/80 bg-amber-50/70 px-4 py-3 text-sm text-amber-950">
            {pipelineSummary.pendingProperties > 0 ? (
              <>
                <span className="font-semibold">{pipelineSummary.pendingProperties}</span> propert
                {pipelineSummary.pendingProperties === 1 ? "y" : "ies"} pending approval.{" "}
                <Link className="font-semibold text-primary underline-offset-2 hover:underline" href={`${portalBase}/properties`}>
                  Review properties
                </Link>
              </>
            ) : null}
            {pipelineSummary.pendingProperties > 0 && pendingApplications > 0 ? <span className="mx-1">·</span> : null}
            {pendingApplications > 0 ? (
              <>
                <span className="font-semibold">{pendingApplications}</span> application{pendingApplications === 1 ? "" : "s"} need a
                decision.{" "}
                <Link className="font-semibold text-primary underline-offset-2 hover:underline" href={`${portalBase}/applications`}>
                  Open applications
                </Link>
              </>
            ) : null}
          </p>
        ) : null}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatLink label="Properties" value={String(pipelineSummary.totalProperties)} href={`${portalBase}/properties`} />
          <StatLink label="Applications" value={String(visibleApplications.length)} href={`${portalBase}/applications`} />
          <StatLink label="Leases" value={String(leasePipelineCount)} href={`${portalBase}/leases`} />
          <StatLink label="Open work orders" value={String(openWorkOrders)} href={`${portalBase}/work-orders`} />
        </div>
      </div>
    </ManagerPortalPageShell>
  );
}
