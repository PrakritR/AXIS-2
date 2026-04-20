"use client";

import { Fragment, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import {
  MANAGER_TABLE_TH,
  ManagerPortalPageShell,
  ManagerPortalStatusPills,
} from "@/components/portal/portal-metrics";
import { PortalPropertyFilterPill } from "@/components/portal/manager-section-shell";
import {
  PORTAL_DATA_TABLE_SCROLL,
  PORTAL_DATA_TABLE_WRAP,
  PORTAL_DETAIL_BTN,
  PORTAL_DETAIL_BTN_PRIMARY,
  PORTAL_TABLE_DETAIL_CELL,
  PORTAL_TABLE_DETAIL_ROW,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_ROW_TOGGLE_CLASS,
  PORTAL_TABLE_TR,
  PORTAL_TABLE_TD,
  PortalTableDetailActions,
} from "@/components/portal/portal-data-table";
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
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
      <div className={PORTAL_DATA_TABLE_WRAP}>
        <div className={PORTAL_DATA_TABLE_SCROLL}>
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead>
              <tr className={PORTAL_TABLE_HEAD_ROW}>
                <th className={`${MANAGER_TABLE_TH} text-left`}>Applicant</th>
                <th className={`${MANAGER_TABLE_TH} text-left`}>Property</th>
                <th className={`${MANAGER_TABLE_TH} text-left`}>Stage</th>
                <th className={`${MANAGER_TABLE_TH} text-left`}>Score</th>
                <th className={`${MANAGER_TABLE_TH} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-sm text-slate-500">
                    {demoApplicantRows.length === 0 ? "No applications yet (demo)." : "No applications in this bucket (demo)."}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <Fragment key={row.id}>
                    <tr className={PORTAL_TABLE_TR}>
                      <td className={`${PORTAL_TABLE_TD} align-middle`}>
                        <p className="font-medium text-slate-900">{row.name}</p>
                        {row.email ? <p className="mt-0.5 text-xs text-slate-500">{row.email}</p> : null}
                      </td>
                      <td className={`${PORTAL_TABLE_TD} align-middle`}>{row.property}</td>
                      <td className={`${PORTAL_TABLE_TD} align-middle`}>{row.stage}</td>
                      <td className={`${PORTAL_TABLE_TD} align-middle tabular-nums text-slate-800`}>{row.score}</td>
                      <td className={`${PORTAL_TABLE_TD} text-right align-middle`}>
                        <Button
                          type="button"
                          variant="outline"
                          className={PORTAL_TABLE_ROW_TOGGLE_CLASS}
                          onClick={() => setExpandedId((cur) => (cur === row.id ? null : row.id))}
                        >
                          {expandedId === row.id ? "Hide" : "Details"}
                        </Button>
                      </td>
                    </tr>
                    {expandedId === row.id ? (
                      <tr className={PORTAL_TABLE_DETAIL_ROW}>
                        <td colSpan={5} className={PORTAL_TABLE_DETAIL_CELL}>
                          <p className="text-sm leading-relaxed text-slate-600">{row.detail}</p>
                          <PortalTableDetailActions>
                            <Button type="button" variant="outline" className={PORTAL_DETAIL_BTN_PRIMARY} onClick={() => showToast("Approved (demo).")}>
                              Approve
                            </Button>
                            <Button type="button" variant="outline" className={PORTAL_DETAIL_BTN} onClick={() => showToast("Rejected (demo).")}>
                              Reject
                            </Button>
                            <Button type="button" variant="outline" className={PORTAL_DETAIL_BTN} onClick={() => showToast("Request info (demo).")}>
                              Request more info
                            </Button>
                          </PortalTableDetailActions>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </ManagerPortalPageShell>
  );
}
