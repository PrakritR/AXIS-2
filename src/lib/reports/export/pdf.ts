import type { ReportColumn, ReportResult } from "@/lib/reports/types";
import {
  createPdfTheme,
  drawDocumentHeader,
  drawStandardFooter,
  drawTableHeaderRow,
  drawTableRow,
  drawTotalsRow,
  PDF_PAGE,
} from "@/lib/reports/export/pdf-theme";

function columnWidths(columns: ReportColumn[], tableWidth: number): number[] {
  const weights = columns.map((col) => {
    if (col.format === "money" || col.align === "right") return 1.1;
    if (col.key === "description" || col.key === "memo" || col.key === "property") return 2.2;
    return 1.4;
  });
  const total = weights.reduce((sum, w) => sum + w, 0);
  return weights.map((w) => (tableWidth * w) / total);
}

export async function reportToPdf(report: ReportResult): Promise<Uint8Array> {
  const theme = await createPdfTheme();
  const { pdf } = theme;
  const margin = PDF_PAGE.margin;
  const tableWidth = PDF_PAGE.width - margin * 2;
  const widths = columnWidths(report.columns, tableWidth);

  let page = pdf.addPage([PDF_PAGE.width, PDF_PAGE.height]);
  const subtitle =
    report.meta?.from && report.meta?.to ? `Reporting period: ${report.meta.from} through ${report.meta.to}` : undefined;
  let y = drawDocumentHeader(page, theme, { title: report.title, subtitle, contentWidth: tableWidth });

  const newPage = () => {
    page = pdf.addPage([PDF_PAGE.width, PDF_PAGE.height]);
    y = drawDocumentHeader(page, theme, { title: report.title, subtitle, contentWidth: tableWidth });
  };

  const ensureSpace = (needed: number) => {
    if (y - needed < PDF_PAGE.footerY + 24) newPage();
  };

  ensureSpace(20);
  y = drawTableHeaderRow(page, theme, report.columns, widths, margin, y);

  report.rows.forEach((row, index) => {
    ensureSpace(18);
    const cells = report.columns.map((col) => ({
      value: String(row[col.key] ?? "—"),
      align: col.align,
    }));
    y = drawTableRow(page, theme, cells, widths, margin, y, { zebra: index % 2 === 1 });
  });

  if (report.totals) {
    ensureSpace(24);
    const cells = report.columns.map((col) => ({
      value: String(report.totals![col.key] ?? ""),
      align: col.align,
    }));
    y = drawTotalsRow(page, theme, cells, widths, margin, y);
  }

  drawStandardFooter(theme, tableWidth);

  return pdf.save();
}
