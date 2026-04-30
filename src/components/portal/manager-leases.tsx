"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ManagerLeasesPipelinePanel } from "@/components/portal/manager-leases-pipeline-panel";
import { ManagerPortalPageShell, ManagerPortalStatusPills } from "@/components/portal/portal-metrics";
import { PortalPropertyFilterPill } from "@/components/portal/manager-section-shell";
import type { ManagerLeaseBucket } from "@/data/demo-portal";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import { LEASE_PIPELINE_EVENT, readLeasePipeline, regenerateAllLeaseHtml, syncLeasePipelineFromServer } from "@/lib/lease-pipeline-storage";
import { MANAGER_APPLICATIONS_EVENT, syncManagerApplicationsFromServer } from "@/lib/manager-applications-storage";
import { buildManagerPropertyFilterOptions } from "@/lib/manager-portfolio-access";
import { syncPropertyPipelineFromServer } from "@/lib/demo-property-pipeline";
import { getPropertyById } from "@/lib/rental-application/data";
import { useAppUi } from "@/components/providers/app-ui-provider";

const LEASE_LABELS: { id: ManagerLeaseBucket; label: string }[] = [
  { id: "manager", label: "Manager review" },
  { id: "admin", label: "Admin review" },
  { id: "resident", label: "Resident signature pending" },
  { id: "signed", label: "Manager signature pending / signed" },
];

function countBuckets(rows: ReturnType<typeof readLeasePipeline>) {
  const c: Record<ManagerLeaseBucket, number> = { manager: 0, admin: 0, resident: 0, signed: 0 };
  for (const r of rows) c[r.bucket] += 1;
  return c;
}

export function ManagerLeases() {
  const { showToast } = useAppUi();
  const { userId, ready: authReady } = useManagerUserId();
  const [bucket, setBucket] = useState<ManagerLeaseBucket>("manager");
  const [tick, setTick] = useState(0);
  const [propertyTick, setPropertyTick] = useState(0);
  const [propertyFilter, setPropertyFilter] = useState("");
  const [residentAccountEmails, setResidentAccountEmails] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!authReady || !userId) return;
    const on = () => setTick((t) => t + 1);
    void Promise.all([syncManagerApplicationsFromServer(), syncLeasePipelineFromServer(userId)]).then(on);
    window.addEventListener(LEASE_PIPELINE_EVENT, on);
    window.addEventListener(MANAGER_APPLICATIONS_EVENT, on);
    return () => {
      window.removeEventListener(LEASE_PIPELINE_EVENT, on);
      window.removeEventListener(MANAGER_APPLICATIONS_EVENT, on);
    };
  }, [authReady, userId]);

  useEffect(() => {
    if (!authReady || !userId) return;
    void syncPropertyPipelineFromServer().then(() => setPropertyTick((t) => t + 1));
  }, [authReady, userId]);

  const propertyOptions = useMemo(() => {
    void tick;
    void propertyTick;
    const base = buildManagerPropertyFilterOptions(userId);
    const labelById = new Map(base.map((option) => [option.id, option.label]));
    for (const row of readLeasePipeline(userId)) {
      const propertyId = row.application?.propertyId?.trim();
      if (!propertyId || labelById.has(propertyId)) continue;
      labelById.set(propertyId, getPropertyById(propertyId)?.title?.trim() || row.unit || propertyId);
    }
    return [...labelById.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  }, [userId, tick, propertyTick]);

  const rows = useMemo(() => {
    void tick;
    const allRows = readLeasePipeline(userId);
    if (!propertyFilter.trim()) return allRows;
    return allRows.filter((row) => row.application?.propertyId?.trim() === propertyFilter);
  }, [tick, propertyFilter, userId]);

  useEffect(() => {
    const emails = [...new Set(rows.map((row) => row.residentEmail.trim().toLowerCase()).filter(Boolean))];
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      if (emails.length === 0) {
        setResidentAccountEmails(new Set());
        return;
      }
      return fetch("/api/manager/resident-account-emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails }),
      })
        .then(async (res) => {
          const body = (await res.json()) as { emails?: string[] };
          if (!cancelled && res.ok) {
            setResidentAccountEmails(new Set((body.emails ?? []).map((email) => email.trim().toLowerCase()).filter(Boolean)));
          }
        })
        .catch(() => {
          if (!cancelled) setResidentAccountEmails(new Set());
        });
    });
    return () => {
      cancelled = true;
    };
  }, [rows]);

  const counts = useMemo(() => countBuckets(rows), [rows]);
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
            <PortalPropertyFilterPill
              propertyOptions={propertyOptions}
              propertyValue={propertyFilter}
              onPropertyChange={setPropertyFilter}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            className="shrink-0 rounded-full"
            onClick={() => {
              const result = regenerateAllLeaseHtml();
              setTick((t) => t + 1);
              showToast(
                result.updated > 0
                  ? `Regenerated ${result.updated} lease${result.updated === 1 ? "" : "s"}.`
                  : "No leases with application data to regenerate.",
              );
            }}
          >
            Regenerate all
          </Button>
          <Button
            type="button"
            variant="outline"
            className="shrink-0 rounded-full"
            onClick={() => {
              if (!userId) return;
              void Promise.all([
                syncPropertyPipelineFromServer({ force: true }),
                syncManagerApplicationsFromServer({ force: true }),
                syncLeasePipelineFromServer(userId, { force: true }),
              ]).then(() => {
                setPropertyTick((t) => t + 1);
                setTick((t) => t + 1);
                showToast("Refreshed.");
              });
            }}
          >
            Refresh
          </Button>
        </>
      }
      filterRow={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="sm:hidden">
            <PortalPropertyFilterPill
              propertyOptions={propertyOptions}
              propertyValue={propertyFilter}
              onPropertyChange={setPropertyFilter}
            />
          </div>
          <ManagerPortalStatusPills tabs={tabs} activeId={bucket} onChange={(id) => setBucket(id as ManagerLeaseBucket)} />
        </div>
      }
    >
      <ManagerLeasesPipelinePanel
        rows={rows}
        bucket={bucket}
        refreshKey={tick}
        residentAccountEmails={residentAccountEmails}
      />
    </ManagerPortalPageShell>
  );
}
