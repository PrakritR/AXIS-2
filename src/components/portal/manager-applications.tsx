"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
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
import { ManagerApplicationReadonlyReview } from "@/components/portal/manager-application-readonly-review";
import type { ManagerApplicationBucket } from "@/data/demo-portal";
import { demoApplicantRows } from "@/data/demo-portal";
import type { DemoApplicantRow } from "@/data/demo-portal";
import {
  MANAGER_APPLICATIONS_EVENT,
  readManagerApplicationRows,
  writeManagerApplicationRows,
} from "@/lib/manager-applications-storage";

function countByBucket(rows: DemoApplicantRow[]) {
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
  const [rows, setRows] = useState<DemoApplicantRow[]>(demoApplicantRows);

  useEffect(() => {
    const sync = () => setRows(readManagerApplicationRows(demoApplicantRows));
    sync();
    window.addEventListener(MANAGER_APPLICATIONS_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(MANAGER_APPLICATIONS_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const persist = useCallback((next: DemoApplicantRow[]) => {
    setRows(next);
    writeManagerApplicationRows(next);
  }, []);

  const counts = useMemo(() => countByBucket(rows), [rows]);
  const tabs = useMemo(
    () =>
      [
        { id: "pending" as const, label: "Pending", count: counts.pending },
        { id: "approved" as const, label: "Approved", count: counts.approved },
        { id: "rejected" as const, label: "Rejected", count: counts.rejected },
      ] as const,
    [counts],
  );

  const rowsForBucket = useMemo(() => rows.filter((r) => r.bucket === bucket), [rows, bucket]);

  const setRowBucket = (id: string, nextBucket: ManagerApplicationBucket) => {
    const next = rows.map((r) => (r.id === id ? { ...r, bucket: nextBucket } : r));
    persist(next);
    setExpandedId(null);
    setBucket(nextBucket);
    const msg =
      nextBucket === "approved"
        ? "Application approved."
        : nextBucket === "rejected"
          ? "Application rejected."
          : "Moved to Pending.";
    showToast(msg);
  };

  const deleteApplication = (id: string) => {
    persist(rows.filter((r) => r.id !== id));
    setExpandedId(null);
    showToast("Application deleted.");
  };

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
              {rowsForBucket.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-sm text-slate-500">
                    {rows.length === 0 ? "No applications yet (demo)." : "No applications in this bucket (demo)."}
                  </td>
                </tr>
              ) : (
                rowsForBucket.map((row) => (
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
                          <PortalTableDetailActions>
                            {row.bucket === "pending" ? (
                              <>
                                <Button type="button" variant="outline" className={PORTAL_DETAIL_BTN_PRIMARY} onClick={() => setRowBucket(row.id, "approved")}>
                                  Approve
                                </Button>
                                <Button type="button" variant="outline" className={PORTAL_DETAIL_BTN} onClick={() => setRowBucket(row.id, "rejected")}>
                                  Reject
                                </Button>
                              </>
                            ) : (
                              <Button type="button" variant="outline" className={PORTAL_DETAIL_BTN} onClick={() => setRowBucket(row.id, "pending")}>
                                Move to pending
                              </Button>
                            )}
                            <Button
                              type="button"
                              variant="outline"
                              className={`${PORTAL_DETAIL_BTN} border-rose-200 text-rose-800 hover:bg-rose-50`}
                              onClick={() => deleteApplication(row.id)}
                            >
                              Delete application
                            </Button>
                          </PortalTableDetailActions>

                          {row.application ? (
                            <div className="mt-4 max-h-[min(70vh,520px)] overflow-y-auto rounded-xl border border-slate-200/80 bg-white p-4">
                              <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Application on file</p>
                              <div className="mt-3">
                                <ManagerApplicationReadonlyReview partial={row.application} />
                              </div>
                            </div>
                          ) : null}

                          <p className="mt-4 text-sm leading-relaxed text-slate-600">
                            <span className="font-medium text-slate-800">Manager notes</span> — {row.detail}
                          </p>
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
