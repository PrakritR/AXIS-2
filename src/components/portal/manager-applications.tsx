"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import {
  MANAGER_TABLE_TH,
  ManagerPortalPageShell,
  ManagerPortalStatusPills,
} from "@/components/portal/portal-metrics";
import { PortalPropertyFilterPill } from "@/components/portal/manager-section-shell";
import type { ManagerApplicationBucket } from "@/data/demo-portal";
import { demoApplicantRows } from "@/data/demo-portal";

function countByBucket(rows: typeof demoApplicantRows) {
  const c = { pending: 0, approved: 0, rejected: 0 };
  for (const r of rows) {
    c[r.bucket] += 1;
  }
  return c;
}

export function ManagerApplications() {
  const { showToast } = useAppUi();
  const [bucket, setBucket] = useState<ManagerApplicationBucket>("pending");

  const counts = useMemo(() => countByBucket(demoApplicantRows), []);
  const tabs = useMemo(
    () =>
      [
        { id: "pending" as const, label: "Pending", count: counts.pending },
        { id: "approved" as const, label: "Approved", count: counts.approved },
        { id: "rejected" as const, label: "Rejected", count: counts.rejected },
      ] as const,
    [counts],
  );

  const rows = useMemo(() => demoApplicantRows.filter((r) => r.bucket === bucket), [bucket]);

  return (
    <ManagerPortalPageShell
      title="Applications"
      titleAside={
        <>
          <PortalPropertyFilterPill />
          <Button type="button" variant="outline" className="shrink-0 rounded-full" onClick={() => showToast("Refreshed (demo).")}>
            Refresh
          </Button>
        </>
      }
      filterRow={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <ManagerPortalStatusPills tabs={[...tabs]} activeId={bucket} onChange={(id) => setBucket(id as ManagerApplicationBucket)} />
        </div>
      }
    >
      <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center bg-slate-50/30 px-4 py-16 text-center sm:py-20">
            <p className="text-sm font-medium text-slate-500">
              {demoApplicantRows.length === 0 ? "No applications yet (demo)." : "No applications in this bucket (demo)."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200/90 bg-white">
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Applicant</th>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Property</th>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Stage</th>
                  <th className={`${MANAGER_TABLE_TH} text-right`}>Score</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={`${row.name}-${i}`} className="border-b border-slate-100 last:border-0">
                    <td className="px-5 py-4 align-middle font-semibold text-slate-900">{row.name}</td>
                    <td className="px-5 py-4 align-middle text-slate-700">{row.property}</td>
                    <td className="px-5 py-4 align-middle text-slate-700">{row.stage}</td>
                    <td className="px-5 py-4 text-right align-middle tabular-nums text-slate-800">{row.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </ManagerPortalPageShell>
  );
}
