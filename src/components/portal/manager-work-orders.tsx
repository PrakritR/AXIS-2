"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { ManagerPortalPageShell, ManagerPortalStatusPills } from "@/components/portal/portal-metrics";
import { PortalPropertyFilterPill } from "@/components/portal/manager-section-shell";
import { ManagerWorkOrdersPanel } from "@/components/portal/manager-work-orders-panel";
import type { DemoManagerWorkOrderRow, ManagerWorkOrderBucket } from "@/data/demo-portal";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import { buildManagerPropertyFilterOptions, collectAccessiblePropertyIds } from "@/lib/manager-portfolio-access";
import { syncPropertyPipelineFromServer } from "@/lib/demo-property-pipeline";
import {
  MANAGER_WORK_ORDERS_DEFAULT_SNAPSHOT,
  MANAGER_WORK_ORDERS_EVENT,
  readManagerWorkOrderRows,
  syncManagerWorkOrdersFromServer,
} from "@/lib/manager-work-orders-storage";

const WO_LABELS: { id: ManagerWorkOrderBucket; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "scheduled", label: "Scheduled" },
  { id: "completed", label: "Completed" },
];

function countWorkOrders(rows: DemoManagerWorkOrderRow[]) {
  const c: Record<ManagerWorkOrderBucket, number> = {
    open: 0,
    scheduled: 0,
    completed: 0,
  };
  for (const r of rows) {
    c[r.bucket] += 1;
  }
  return c;
}

export function ManagerWorkOrders() {
  const { showToast } = useAppUi();
  const { userId, ready: authReady } = useManagerUserId();
  const [bucket, setBucket] = useState<ManagerWorkOrderBucket>("open");
  /** Avoid SSR / hydration mismatch before backend records hydrate. */
  const [storageReady, setStorageReady] = useState(false);
  /** Bumps when backend work orders change. */
  const [storeTick, setStoreTick] = useState(0);
  const [propertyTick, setPropertyTick] = useState(0);
  const [propertyFilter, setPropertyFilter] = useState("");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setStorageReady(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const bump = () => setStoreTick((t) => t + 1);
    void syncManagerWorkOrdersFromServer().then(bump);
    window.addEventListener(MANAGER_WORK_ORDERS_EVENT, bump);
    return () => {
      window.removeEventListener(MANAGER_WORK_ORDERS_EVENT, bump);
    };
  }, []);

  useEffect(() => {
    if (!authReady || !userId) return;
    void syncPropertyPipelineFromServer().then(() => setPropertyTick((t) => t + 1));
  }, [authReady, userId]);

  const allRows = useMemo(
    () => {
      void storeTick;
      return storageReady ? readManagerWorkOrderRows() : MANAGER_WORK_ORDERS_DEFAULT_SNAPSHOT;
    },
    [storageReady, storeTick],
  );

  const scopedRows = useMemo(() => {
    void propertyTick;
    if (!userId) return [];
    const propertyIds = collectAccessiblePropertyIds(userId);
    return allRows.filter((row) => {
      if (row.managerUserId && row.managerUserId === userId) return true;
      const pid = row.assignedPropertyId?.trim() || row.propertyId?.trim();
      return Boolean(pid && propertyIds.has(pid));
    });
  }, [allRows, userId, propertyTick]);

  const propertyOptions = useMemo(() => {
    void propertyTick;
    return buildManagerPropertyFilterOptions(userId);
  }, [userId, propertyTick]);

  const filteredRows = useMemo(() => {
    if (!propertyFilter.trim()) return scopedRows;
    return scopedRows.filter((row) => (row.assignedPropertyId?.trim() || row.propertyId?.trim() || "") === propertyFilter);
  }, [scopedRows, propertyFilter]);

  const counts = useMemo(() => countWorkOrders(filteredRows), [filteredRows]);
  const tabs = useMemo(
    () => WO_LABELS.map(({ id, label }) => ({ id, label, count: counts[id] })),
    [counts],
  );

  return (
    <ManagerPortalPageShell
      title="Work orders"
      titleAside={
        <>
          <PortalPropertyFilterPill
            propertyOptions={propertyOptions}
            propertyValue={propertyFilter}
            onPropertyChange={setPropertyFilter}
          />
          <Button type="button" variant="outline" className="shrink-0 rounded-full" onClick={() => showToast("Work orders refreshed.")}>
            Refresh
          </Button>
        </>
      }
      filterRow={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <ManagerPortalStatusPills tabs={tabs} activeId={bucket} onChange={(id) => setBucket(id as ManagerWorkOrderBucket)} />
        </div>
      }
    >
      <ManagerWorkOrdersPanel
        allRows={filteredRows}
        bucket={bucket}
        onAfterSchedule={() => setBucket("scheduled")}
      />
    </ManagerPortalPageShell>
  );
}
