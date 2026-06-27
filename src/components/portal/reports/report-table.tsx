"use client";

import type { ReportColumn, ReportResult } from "@/lib/reports/types";
import { MANAGER_TABLE_TH } from "@/components/portal/portal-metrics";
import {
  PORTAL_DATA_TABLE_SCROLL,
  PORTAL_DATA_TABLE_WRAP,
  PortalDataTableEmpty,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_TD,
  PORTAL_TABLE_TR,
} from "@/components/portal/portal-data-table";

function cellAlign(col: ReportColumn): string {
  return col.align === "right" ? "text-right tabular-nums" : "text-left";
}

export function ReportTable({ report, loading }: { report: ReportResult | null; loading?: boolean }) {
  if (loading) {
    return (
      <div className={PORTAL_DATA_TABLE_WRAP}>
        <div className="px-5 py-12 text-center text-sm text-muted">Loading report…</div>
      </div>
    );
  }
  if (!report || report.rows.length === 0) {
    return <PortalDataTableEmpty message="No data for the selected filters." />;
  }

  return (
    <div className={PORTAL_DATA_TABLE_WRAP}>
      <div className={PORTAL_DATA_TABLE_SCROLL}>
        <table className="w-full min-w-[640px] border-collapse text-left">
          <thead>
            <tr className={PORTAL_TABLE_HEAD_ROW}>
              {report.columns.map((col) => (
                <th key={col.key} className={`${MANAGER_TABLE_TH} ${cellAlign(col)}`}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.rows.map((row, idx) => (
              <tr key={idx} className={PORTAL_TABLE_TR}>
                {report.columns.map((col) => (
                  <td key={col.key} className={`${PORTAL_TABLE_TD} ${cellAlign(col)}`}>
                    {String(row[col.key] ?? "—")}
                  </td>
                ))}
              </tr>
            ))}
            {report.totals ? (
              <tr className={`${PORTAL_TABLE_TR} bg-accent/20 font-semibold`}>
                {report.columns.map((col) => (
                  <td key={col.key} className={`${PORTAL_TABLE_TD} ${cellAlign(col)}`}>
                    {String(report.totals![col.key] ?? "")}
                  </td>
                ))}
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
