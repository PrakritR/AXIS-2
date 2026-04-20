"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { ManagerPortalPageShell, ManagerPortalStatusPills } from "@/components/portal/portal-metrics";
import { PortalPropertyFilterPill } from "@/components/portal/manager-section-shell";
import { ManagerWorkOrdersPanel } from "@/components/portal/manager-work-orders-panel";
import type { ManagerWorkOrderBucket } from "@/data/demo-portal";
import { demoManagerWorkOrderRowsFull } from "@/data/demo-portal";
import { readManagerWorkOrderRows, subscribeManagerWorkOrders } from "@/lib/manager-work-orders-storage";

const WO_LABELS: { id: ManagerWorkOrderBucket; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "scheduled", label: "Scheduled" },
  { id: "completed", label: "Completed" },
];

function countWorkOrders(rows: typeof demoManagerWorkOrderRowsFull) {
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
  const [bucket, setBucket] = useState<ManagerWorkOrderBucket>("open");

  const allRows = useSyncExternalStore(
    subscribeManagerWorkOrders,
    () => readManagerWorkOrderRows(demoManagerWorkOrderRowsFull),
    () => demoManagerWorkOrderRowsFull,
  );

  const counts = useMemo(() => countWorkOrders(allRows), [allRows]);
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
          <Button type="button" variant="outline" className="shrink-0 rounded-full" onClick={() => showToast("Refreshed work orders (demo).")}>
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
      <ManagerWorkOrdersPanel bucket={bucket} onAfterSchedule={() => setBucket("scheduled")} />
    </ManagerPortalPageShell>
  );
}
