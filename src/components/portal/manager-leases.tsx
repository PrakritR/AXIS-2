"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ManagerLeasesPipelinePanel } from "@/components/portal/manager-leases-pipeline-panel";
import { ManagerPortalPageShell, ManagerPortalStatusPills } from "@/components/portal/portal-metrics";
import { PortalPropertyFilterPill } from "@/components/portal/manager-section-shell";
import type { ManagerLeaseBucket } from "@/data/demo-portal";
import { LEASE_PIPELINE_EVENT, readLeasePipeline, syncLeasePipelineFromServer } from "@/lib/lease-pipeline-storage";
import { MANAGER_APPLICATIONS_EVENT } from "@/lib/manager-applications-storage";
import { useAppUi } from "@/components/providers/app-ui-provider";

const LEASE_LABELS: { id: ManagerLeaseBucket; label: string }[] = [
  { id: "manager", label: "Manager review" },
  { id: "admin", label: "Admin review" },
  { id: "resident", label: "With resident" },
  { id: "signed", label: "Signed" },
];

function countBuckets(rows: ReturnType<typeof readLeasePipeline>) {
  const c: Record<ManagerLeaseBucket, number> = { manager: 0, admin: 0, resident: 0, signed: 0 };
  for (const r of rows) c[r.bucket] += 1;
  return c;
}

export function ManagerLeases() {
  const { showToast } = useAppUi();
  const [bucket, setBucket] = useState<ManagerLeaseBucket>("manager");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const on = () => setTick((t) => t + 1);
    void syncLeasePipelineFromServer().then(on);
    window.addEventListener(LEASE_PIPELINE_EVENT, on);
    window.addEventListener(MANAGER_APPLICATIONS_EVENT, on);
    return () => {
      window.removeEventListener(LEASE_PIPELINE_EVENT, on);
      window.removeEventListener(MANAGER_APPLICATIONS_EVENT, on);
    };
  }, []);

  const counts = useMemo(() => countBuckets(readLeasePipeline()), [tick]);
  const tabs = useMemo(
    () => LEASE_LABELS.map(({ id, label }) => ({ id, label, count: counts[id] })),
    [counts],
  );

  return (
    <ManagerPortalPageShell
      title="Leases"
      titleAside={
        <>
          <div className="hidden min-w-0 sm:block">
            <PortalPropertyFilterPill />
          </div>
          <Button
            type="button"
            variant="outline"
            className="shrink-0 rounded-full"
            onClick={() => {
              setTick((t) => t + 1);
              showToast("Refreshed.");
            }}
          >
            Refresh
          </Button>
        </>
      }
      filterRow={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="sm:hidden">
            <PortalPropertyFilterPill />
          </div>
          <ManagerPortalStatusPills tabs={tabs} activeId={bucket} onChange={(id) => setBucket(id as ManagerLeaseBucket)} />
        </div>
      }
    >
      <ManagerLeasesPipelinePanel bucket={bucket} refreshKey={tick} />
    </ManagerPortalPageShell>
  );
}
