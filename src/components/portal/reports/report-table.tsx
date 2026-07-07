"use client";

import type { ReportColumn, ReportResult } from "@/lib/reports/types";
import { MANAGER_TABLE_TH } from "@/components/portal/portal-metrics";
import { PORTAL_DATA_TABLE, PortalDataTableColGroup, portalTableColumnPercents, PORTAL_DATA_TABLE_SCROLL,
  PORTAL_DATA_TABLE_WRAP,
  PORTAL_MOBILE_CARD_CLASS,
  PortalDataTableEmpty,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_TD,
  PORTAL_TABLE_TR,} from "@/components/portal/portal-data-table";
import { ReportGeneratePrompt } from "@/components/portal/reports/report-generate-prompt";

function cellAlign(col: ReportColumn): string {
  return col.align === "right" ? "text-right tabular-nums" : "text-left";
}

export function ReportTable({
  report,
  loading,
  generated = true,
}: {
  report: ReportResult | null;
  loading?: boolean;
  generated?: boolean;
}) {
  if (loading) {
    return (
      <div className={PORTAL_DATA_TABLE_WRAP}>
        <div className="px-5 py-12 text-center text-sm text-muted">Generating report…</div>
      </div>
    );
  }
  if (!generated) {
    return <ReportGeneratePrompt />;
  }
  if (!report || report.rows.length === 0) {
    return <PortalDataTableEmpty message="No report data yet." icon="data" />;
  }

  return (
    <>
      <div className="space-y-2 lg:hidden">
        {report.rows.map((row, idx) => (
          <div key={idx} className={PORTAL_MOBILE_CARD_CLASS}>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              {report.columns.map((col) => (
                <div key={col.key} className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted/70">{col.label}</p>
                  <p className="truncate text-sm text-foreground/80">{String(row[col.key] ?? "—")}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
        {report.totals ? (
          <div className={`${PORTAL_MOBILE_CARD_CLASS} bg-accent/20`}>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              {report.columns.map((col) => (
                <div key={col.key} className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted/70">{col.label}</p>
                  <p className="truncate text-sm font-semibold text-foreground">{String(report.totals![col.key] ?? "")}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      <div className={`${PORTAL_DATA_TABLE_WRAP} hidden lg:block`}>
        <div className={PORTAL_DATA_TABLE_SCROLL}>
          <table className={PORTAL_DATA_TABLE}>
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
    </>
  );
}
