import type { ReportResult } from "@/lib/reports/types";

function escapeCsv(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function reportToCsv(report: ReportResult): string {
  const header = report.columns.map((c) => escapeCsv(c.label)).join(",");
  const body = report.rows.map((row) =>
    report.columns.map((c) => escapeCsv(String(row[c.key] ?? ""))).join(","),
  );
  const lines = [header, ...body];
  if (report.totals) {
    lines.push(report.columns.map((c) => escapeCsv(String(report.totals![c.key] ?? ""))).join(","));
  }
  return lines.join("\n");
}
