import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { ReportColumn, ReportResult } from "@/lib/reports/types";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 48;
const FOOTER_Y = 42;

function truncate(text: string, max: number): string {
  const value = String(text ?? "").trim();
  if (value.length <= max) return value || "—";
  return `${value.slice(0, max - 1)}…`;
}

function drawWrappedLine(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  size: number,
  font: PDFFont,
  maxWidth: number,
  color = rgb(0.12, 0.14, 0.18),
) {
  page.drawText(truncate(text, 120), { x, y, size, font, color, maxWidth });
}

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
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);

  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;
  const tableWidth = PAGE_WIDTH - MARGIN * 2;
  const widths = columnWidths(report.columns, tableWidth);

  const newPage = () => {
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN;
  };

  const ensureSpace = (needed: number) => {
    if (y - needed < FOOTER_Y + 24) newPage();
  };

  drawWrappedLine(page, "AXIS PROPERTY MANAGEMENT", MARGIN, y, 9, bold, tableWidth);
  y -= 14;
  drawWrappedLine(page, report.title.toUpperCase(), MARGIN, y, 18, bold, tableWidth);
  y -= 22;
  drawWrappedLine(
    page,
    `Generated ${new Date().toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" })}`,
    MARGIN,
    y,
    9,
    regular,
    tableWidth,
    rgb(0.35, 0.4, 0.48),
  );
  y -= 12;
  if (report.meta?.from && report.meta?.to) {
    drawWrappedLine(page, `Reporting period: ${report.meta.from} through ${report.meta.to}`, MARGIN, y, 9, regular, tableWidth);
    y -= 14;
  }
  y -= 8;

  const drawHeaderRow = () => {
    ensureSpace(28);
    let x = MARGIN;
    page.drawRectangle({
      x: MARGIN,
      y: y - 16,
      width: tableWidth,
      height: 18,
      color: rgb(0.93, 0.95, 0.98),
      borderColor: rgb(0.82, 0.86, 0.9),
      borderWidth: 0.5,
    });
    for (let i = 0; i < report.columns.length; i++) {
      const col = report.columns[i]!;
      const width = widths[i]!;
      drawWrappedLine(page, col.label.toUpperCase(), x + 4, y - 12, 8, bold, width - 8);
      x += width;
    }
    y -= 22;
  };

  drawHeaderRow();

  for (const row of report.rows) {
    ensureSpace(18);
    let x = MARGIN;
    page.drawLine({
      start: { x: MARGIN, y: y + 4 },
      end: { x: MARGIN + tableWidth, y: y + 4 },
      thickness: 0.5,
      color: rgb(0.88, 0.9, 0.93),
    });
    for (let i = 0; i < report.columns.length; i++) {
      const col = report.columns[i]!;
      const width = widths[i]!;
      const value = truncate(String(row[col.key] ?? "—"), 64);
      const textX = col.align === "right" ? x + width - 4 - regular.widthOfTextAtSize(value, 8) : x + 4;
      page.drawText(value, { x: Math.max(x + 4, textX), y: y - 10, size: 8, font: regular, color: rgb(0.12, 0.14, 0.18) });
      x += width;
    }
    y -= 16;
  }

  if (report.totals) {
    ensureSpace(24);
    let x = MARGIN;
    page.drawRectangle({
      x: MARGIN,
      y: y - 16,
      width: tableWidth,
      height: 18,
      color: rgb(0.96, 0.97, 0.99),
      borderColor: rgb(0.82, 0.86, 0.9),
      borderWidth: 0.5,
    });
    for (let i = 0; i < report.columns.length; i++) {
      const col = report.columns[i]!;
      const width = widths[i]!;
      const value = truncate(String(report.totals![col.key] ?? ""), 64);
      const textX = col.align === "right" ? x + width - 4 - bold.widthOfTextAtSize(value, 8.5) : x + 4;
      page.drawText(value, { x: Math.max(x + 4, textX), y: y - 11, size: 8.5, font: bold, color: rgb(0.12, 0.14, 0.18) });
      x += width;
    }
    y -= 28;
  }

  ensureSpace(48);
  drawWrappedLine(
    page,
    "This report was prepared from Axis property records for management, tax, and audit purposes. Retain with supporting bank statements.",
    MARGIN,
    y,
    8,
    italic,
    tableWidth,
    rgb(0.35, 0.4, 0.48),
  );

  const pages = pdf.getPages();
  pages.forEach((p, index) => {
    p.drawText(`Page ${index + 1} of ${pages.length}`, {
      x: MARGIN,
      y: FOOTER_Y,
      size: 8,
      font: regular,
      color: rgb(0.45, 0.5, 0.58),
    });
  });

  return pdf.save();
}
