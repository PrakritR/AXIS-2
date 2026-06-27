import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { ReportResult } from "@/lib/reports/types";

export async function reportToPdf(report: ReportResult): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const margin = 48;
  let y = 740;

  const draw = (text: string, size: number, font = regular) => {
    if (y < 60) return;
    page.drawText(text.slice(0, 90), { x: margin, y, size, font, color: rgb(0.1, 0.1, 0.1) });
    y -= size + 8;
  };

  draw("Axis Documents", 10, bold);
  draw(report.title, 16, bold);
  draw(`Generated ${new Date().toLocaleString()}`, 9);
  if (report.meta?.from && report.meta?.to) {
    draw(`Period: ${report.meta.from} — ${report.meta.to}`, 9);
  }
  y -= 6;

  draw(report.columns.map((c) => c.label).join("  |  "), 9, bold);

  for (const row of report.rows.slice(0, 40)) {
    const line = report.columns.map((c) => String(row[c.key] ?? "")).join("  |  ");
    draw(line, 8);
  }

  if (report.totals) {
    y -= 4;
    draw(
      report.columns.map((c) => String(report.totals![c.key] ?? "")).join("  |  "),
      9,
      bold,
    );
  }

  return pdf.save();
}
