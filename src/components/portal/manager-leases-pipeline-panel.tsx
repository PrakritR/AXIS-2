"use client";

import { Fragment, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { MANAGER_TABLE_TH } from "@/components/portal/portal-metrics";
import {
  PORTAL_DATA_TABLE_SCROLL,
  PORTAL_DATA_TABLE_WRAP,
  PortalDataTableEmpty,
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
import type { ManagerLeaseBucket } from "@/data/demo-portal";
import { demoManagerLeaseDraftRows } from "@/data/demo-portal";

export function ManagerLeasesPipelinePanel({ bucket }: { bucket: ManagerLeaseBucket }) {
  const { showToast } = useAppUi();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const rows = useMemo(() => demoManagerLeaseDraftRows.filter((r) => r.bucket === bucket), [bucket]);

  if (rows.length === 0) {
    return (
      <PortalDataTableEmpty
        message={
          demoManagerLeaseDraftRows.length === 0 ? "No lease drafts yet (demo)." : "No drafts in this stage (demo)."
        }
      />
    );
  }

  return (
    <div className={PORTAL_DATA_TABLE_WRAP}>
      <div className={PORTAL_DATA_TABLE_SCROLL}>
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className={PORTAL_TABLE_HEAD_ROW}>
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
                  <tr className={PORTAL_TABLE_TR}>
                    <td className={`${PORTAL_TABLE_TD} font-medium text-slate-900`}>{row.resident}</td>
                    <td className={PORTAL_TABLE_TD}>{row.unit}</td>
                    <td className={PORTAL_TABLE_TD}>{row.stageLabel}</td>
                    <td className={`${PORTAL_TABLE_TD} text-slate-500`}>{row.updated}</td>
                    <td className={`${PORTAL_TABLE_TD} text-right`}>
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
                        <p className="text-sm leading-relaxed text-slate-600">{row.notes}</p>
                        <p className="mt-1.5 text-xs text-slate-500">PDF version {row.pdfVersion}</p>
                        <PortalTableDetailActions>
                          <Button type="button" variant="outline" className={PORTAL_DETAIL_BTN} onClick={() => showToast("Lease PDF generated (demo).")}>
                            Generate PDF
                          </Button>
                          <Button type="button" variant="outline" className={PORTAL_DETAIL_BTN_PRIMARY} onClick={() => showToast("Marked signed (demo).")}>
                            Mark signed
                          </Button>
                          <Button type="button" variant="outline" className={PORTAL_DETAIL_BTN} onClick={() => showToast("Edit request sent (demo).")}>
                            Request edits
                          </Button>
                        </PortalTableDetailActions>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
    </div>
  );
}
