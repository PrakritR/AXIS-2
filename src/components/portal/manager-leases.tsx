"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { ManagerPortalPageShell, ManagerPortalStatusPills } from "@/components/portal/portal-metrics";
import { PortalPropertyFilterPill } from "@/components/portal/manager-section-shell";
import { ManagerLeasesPipelinePanel } from "@/components/portal/manager-leases-pipeline-panel";
import type { ManagerLeaseBucket } from "@/data/demo-portal";
import { demoManagerLeaseDraftRows } from "@/data/demo-portal";

const LEASE_LABELS: { id: ManagerLeaseBucket; label: string }[] = [
  { id: "manager", label: "Manager review" },
  { id: "admin", label: "Admin review" },
  { id: "resident", label: "With resident" },
  { id: "signed", label: "Signed" },
];

function countLeases(rows: typeof demoManagerLeaseDraftRows) {
  const c: Record<ManagerLeaseBucket, number> = {
    manager: 0,
    admin: 0,
    resident: 0,
    signed: 0,
  };
  for (const r of rows) {
    c[r.bucket] += 1;
  }
  return c;
}

export function ManagerLeases() {
  const { showToast } = useAppUi();
  const [bucket, setBucket] = useState<ManagerLeaseBucket>("manager");

  const counts = useMemo(() => countLeases(demoManagerLeaseDraftRows), []);
  const tabs = useMemo(
    () => LEASE_LABELS.map(({ id, label }) => ({ id, label, count: counts[id] })),
    [counts],
  );

  return (
    <ManagerPortalPageShell
      title="Leases"
      titleAside={
        <>
          <Button type="button" variant="outline" className="shrink-0 rounded-full" onClick={() => showToast("Refreshed (demo).")}>
            Refresh
          </Button>
        </>
      }
      filterRow={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <ManagerPortalStatusPills tabs={tabs} activeId={bucket} onChange={(id) => setBucket(id as ManagerLeaseBucket)} />
          <PortalPropertyFilterPill />
        </div>
      }
    >
      <ManagerLeasesPipelinePanel bucket={bucket} />
    </ManagerPortalPageShell>
  );
}
