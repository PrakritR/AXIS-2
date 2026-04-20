"use client";

import { Fragment, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { MANAGER_TABLE_TH } from "@/components/portal/portal-metrics";
import type { ManagerLeaseBucket } from "@/data/demo-portal";
import { demoManagerLeaseDraftRows } from "@/data/demo-portal";

export function ManagerLeasesPipelinePanel({ bucket }: { bucket: ManagerLeaseBucket }) {
  const { showToast } = useAppUi();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const rows = useMemo(() => demoManagerLeaseDraftRows.filter((r) => r.bucket === bucket), [bucket]);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center bg-slate-50/30 px-4 py-16 text-center sm:py-20">
          <p className="text-sm font-medium text-slate-500">
            {demoManagerLeaseDraftRows.length === 0 ? "No lease drafts yet (demo)." : "No drafts in this stage (demo)."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200/90 bg-white">
                <th className={`${MANAGER_TABLE_TH} text-left`}>Resident</th>
                <th className={`${MANAGER_TABLE_TH} text-left`}>Unit / home</th>
                <th className={`${MANAGER_TABLE_TH} text-left`}>Stage</th>
                <th className={`${MANAGER_TABLE_TH} text-left`}>Updated</th>
                <th className={`${MANAGER_TABLE_TH} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Fragment key={row.id}>
                  <tr className="border-b border-slate-100 align-top last:border-0">
                    <td className="px-5 py-4 font-medium text-slate-900">{row.resident}</td>
                    <td className="px-5 py-4 text-slate-700">{row.unit}</td>
                    <td className="px-5 py-4 text-slate-700">{row.stageLabel}</td>
                    <td className="px-5 py-4 text-slate-600">{row.updated}</td>
                    <td className="px-5 py-4 text-right">
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-full border-slate-200 px-4 py-2 text-sm font-medium text-slate-800"
                        onClick={() => setExpandedId((cur) => (cur === row.id ? null : row.id))}
                      >
                        {expandedId === row.id ? "Hide" : "Details"}
                      </Button>
                    </td>
                  </tr>
                  {expandedId === row.id ? (
                    <tr className="border-b border-slate-100 bg-slate-50/80 last:border-0">
                      <td colSpan={5} className="px-5 py-5">
                        <p className="text-sm text-slate-700">{row.notes}</p>
                        <p className="mt-2 text-xs text-slate-500">PDF version: {row.pdfVersion}</p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            className="rounded-full !border-0 !bg-sky-600 px-4 text-xs !text-white hover:!bg-sky-700"
                            onClick={() => showToast("Lease PDF generated (demo).")}
                          >
                            Generate PDF
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="rounded-full !border-0 !bg-emerald-600 px-4 text-xs !text-white hover:!bg-emerald-700"
                            onClick={() => showToast("Marked signed (demo).")}
                          >
                            Mark signed
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="rounded-full border-amber-300 px-4 text-xs text-amber-950 hover:bg-amber-50"
                            onClick={() => showToast("Edit request sent (demo).")}
                          >
                            Request edits
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
