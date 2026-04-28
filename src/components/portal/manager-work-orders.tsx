"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { ManagerPortalPageShell, ManagerPortalStatusPills } from "@/components/portal/portal-metrics";
import { PortalPropertyFilterPill } from "@/components/portal/manager-section-shell";
import { ManagerWorkOrdersPanel } from "@/components/portal/manager-work-orders-panel";
import type { DemoManagerWorkOrderRow, ManagerWorkOrderBucket } from "@/data/demo-portal";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import { collectAccessiblePropertyIds } from "@/lib/manager-portfolio-access";
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
  const { userId } = useManagerUserId();
  const [bucket, setBucket] = useState<ManagerWorkOrderBucket>("open");
  /** Avoid SSR / hydration mismatch: server and first client paint must not read localStorage yet. */
  const [storageReady, setStorageReady] = useState(false);
  /** Bumps when work orders or cross-tab storage changes — avoid useSyncExternalStore with unstable array snapshots. */
  const [storeTick, setStoreTick] = useState(0);

  useEffect(() => setStorageReady(true), []);

  useEffect(() => {
    const bump = () => setStoreTick((t) => t + 1);
    void syncManagerWorkOrdersFromServer().then(bump);
    window.addEventListener(MANAGER_WORK_ORDERS_EVENT, bump);
    window.addEventListener("storage", bump);
    return () => {
      window.removeEventListener(MANAGER_WORK_ORDERS_EVENT, bump);
      window.removeEventListener("storage", bump);
    };
  }, []);

  const allRows = useMemo(
    () =>
      storageReady ? readManagerWorkOrderRows() : MANAGER_WORK_ORDERS_DEFAULT_SNAPSHOT,
    [storageReady, storeTick],
  );

  const scopedRows = useMemo(() => {
    if (!userId) return [];
    const propertyIds = collectAccessiblePropertyIds(userId);
    return allRows.filter((row) => {
      if (row.managerUserId && row.managerUserId === userId) return true;
      const pid = row.assignedPropertyId?.trim() || row.propertyId?.trim();
      return Boolean(pid && propertyIds.has(pid));
    });
  }, [allRows, userId]);

  const counts = useMemo(() => countWorkOrders(scopedRows), [scopedRows]);
  const tabs = useMemo(
    () => WO_LABELS.map(({ id, label }) => ({ id, label, count: counts[id] })),
    [counts],
  );

  return (
    <ManagerPortalPageShell
      title="Work orders"
      titleAside={
        <>
          <PortalPropertyFilterPill applications />
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
        allRows={scopedRows}
        bucket={bucket}
        onAfterSchedule={() => setBucket("scheduled")}
      />
    </ManagerPortalPageShell>
  );
}
