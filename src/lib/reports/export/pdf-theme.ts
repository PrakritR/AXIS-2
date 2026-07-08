/**
 * Shared branded PDF template — translates the app's "Blue Steel" design tokens
 * (docs/design.md) into pdf-lib primitives once, so every generator in
 * src/lib/reports/export/ stops hand-rolling rgb() literals and produces a
 * document that visually matches the on-screen formal-document preview
 * (src/components/portal/reports/formal-document-preview.tsx).
 *
 * PDFs use a fixed light-paper palette regardless of the viewer's app theme —
 * see AGENTS.md §9.6 (documents are printed/emailed artifacts, not themed UI).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type Color, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";

function hex(value: string): Color {
  const clean = value.replace("#", "");
  const r = Number.parseInt(clean.slice(0, 2), 16) / 255;
  const g = Number.parseInt(clean.slice(2, 4), 16) / 255;
  const b = Number.parseInt(clean.slice(4, 6), 16) / 255;
  return rgb(r, g, b);
}

/** Blue Steel tokens (docs/design.md, light theme — PDFs never theme-switch). */
export const PDF_COLORS = {
  cobalt: rgb(0.184, 0.42, 1.0), // --primary #2f6bff
  cobaltDeep: hex("#1e4fd6"), // --cobalt-deep
  navy: rgb(0.043, 0.106, 0.227), // --foreground (light) #0b1b3a
  text: hex("#1a1a1a"),
  muted: hex("#4a5878"), // --muted
  border: hex("#e5e7eb"), // DocumentPaper table border
  zebraLight: hex("#f8fafc"),
  zebraMid: hex("#f1f5f9"),
  totalsBg: hex("#eef2ff"),
  white: rgb(1, 1, 1),
  status: {
    pending: { bg: hex("#fdeccb"), fg: hex("#a06b15") },
    approved: { bg: hex("#e2ebff"), fg: hex("#2f6bff") },
    confirmed: { bg: hex("#d8f3e4"), fg: hex("#1f8a5b") },
    overdue: { bg: hex("#fbe1de"), fg: hex("#c0392b") },
  },
} as const;

export type PdfStatusTone = keyof typeof PDF_COLORS.status;

export const PDF_PAGE = {
  width: 612,
  height: 792,
  margin: 48,
  footerY: 42,
} as const;

export type PdfTheme = {
  pdf: PDFDocument;
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  logo: PDFImage | null;
};

let cachedLogoBytes: Uint8Array | null = null;

function loadLogoBytes(): Uint8Array | null {
  if (cachedLogoBytes) return cachedLogoBytes;
  try {
    cachedLogoBytes = new Uint8Array(
      readFileSync(path.join(process.cwd(), "src/lib/reports/export/assets/axis-logo-mark.png")),
    );
    return cachedLogoBytes;
  } catch {
    return null;
  }
}

/** Create a fresh pdf-lib document with fonts + the embedded Axis mark loaded once. */
export async function createPdfTheme(): Promise<PdfTheme> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const logoBytes = loadLogoBytes();
  const logo = logoBytes ? await pdf.embedPng(logoBytes) : null;
  return { pdf, regular, bold, italic, logo };
}

/**
 * Guards the page bottom: when fewer than `needed` points remain above the
 * standard footer, starts a fresh page (top margin, or `drawPageHeader` when
 * a repeated header is wanted) and returns the new cursor. Call before each
 * block/row so long documents flow onto extra pages instead of drawing over
 * the footer.
 */
export function ensurePageSpace(
  theme: PdfTheme,
  page: PDFPage,
  y: number,
  needed: number,
  drawPageHeader?: (page: PDFPage) => number,
): { page: PDFPage; y: number } {
  if (y - needed >= PDF_PAGE.footerY + 30) return { page, y };
  const next = theme.pdf.addPage([PDF_PAGE.width, PDF_PAGE.height]);
  return { page: next, y: drawPageHeader ? drawPageHeader(next) : PDF_PAGE.height - PDF_PAGE.margin };
}

/** Height {@link drawWrappedText} will occupy for `text` — same wrap rules. */
export function wrappedTextHeight(
  font: PDFFont,
  text: string,
  size: number,
  maxWidth: number,
  lineHeight = size + 4,
): number {
  const words = text.split(/\s+/).filter(Boolean);
  let line = "";
  let lines = 0;
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines += 1;
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines += 1;
  return lines * lineHeight;
}

/** Height {@link drawInfoBlock} will occupy for these lines — kept in sync with its layout. */
export function infoBlockHeight(lines: string[]): number {
  return 28 + lines.filter(Boolean).length * 12;
}

function truncate(text: string, max: number): string {
  const value = String(text ?? "").trim();
  if (value.length <= max) return value || "—";
  return `${value.slice(0, max - 1)}…`;
}

export function drawText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  size: number,
  font: PDFFont,
  color: Color = PDF_COLORS.text,
  maxWidth?: number,
) {
  let value = truncate(text, 160);
  if (maxWidth != null && font.widthOfTextAtSize(value, size) > maxWidth) {
    let head = value;
    while (head.length > 1 && font.widthOfTextAtSize(`${head.trimEnd()}…`, size) > maxWidth) {
      head = head.slice(0, -1);
    }
    value = `${head.trimEnd()}…`;
  }
  page.drawText(value, { x, y, size, font, color });
}

/**
 * Word-wraps a paragraph across as many lines as needed — unlike
 * {@link drawText}, never truncates. Use for certification / disclaimer
 * copy; use `drawText` for single-line labels and table cells. Returns the y
 * cursor after the last line.
 */
export function drawWrappedText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  size: number,
  font: PDFFont,
  maxWidth: number,
  color: Color = PDF_COLORS.muted,
  lineHeight = size + 4,
): number {
  const words = text.split(/\s+/).filter(Boolean);
  let line = "";
  let cursorY = y;
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      page.drawText(line, { x, y: cursorY, size, font, color });
      cursorY -= lineHeight;
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) {
    page.drawText(line, { x, y: cursorY, size, font, color });
    cursorY -= lineHeight;
  }
  return cursorY;
}

/**
 * Draws the standard document header — Axis mark + "Axis Property
 * Management" wordmark, document title, generation date, optional subtitle —
 * shared by every PDF generator. Returns the y cursor after the header.
 */
export function drawDocumentHeader(
  page: PDFPage,
  theme: PdfTheme,
  opts: { title: string; subtitle?: string; contentWidth: number },
): number {
  const { regular, bold, logo } = theme;
  const margin = PDF_PAGE.margin;
  let y = PDF_PAGE.height - margin;

  const logoHeight = 22;
  let textX = margin;
  if (logo) {
    const logoWidth = (logo.width / logo.height) * logoHeight;
    page.drawImage(logo, { x: margin, y: y - logoHeight + 4, width: logoWidth, height: logoHeight });
    textX = margin + logoWidth + 10;
  }
  drawText(page, "AXIS PROPERTY MANAGEMENT", textX, y - 6, 9, bold, PDF_COLORS.muted, opts.contentWidth);
  y -= logo ? logoHeight + 12 : 14;

  drawText(page, opts.title.toUpperCase(), margin, y, 18, bold, PDF_COLORS.navy, opts.contentWidth);
  y -= 22;

  drawText(
    page,
    `Generated ${new Date().toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" })}`,
    margin,
    y,
    9,
    regular,
    PDF_COLORS.muted,
    opts.contentWidth,
  );
  y -= 12;

  if (opts.subtitle) {
    drawText(page, opts.subtitle, margin, y, 9, regular, PDF_COLORS.muted, opts.contentWidth);
    y -= 14;
  }

  y -= 10;
  page.drawLine({
    start: { x: margin, y: y + 6 },
    end: { x: margin + opts.contentWidth, y: y + 6 },
    thickness: 0.75,
    color: PDF_COLORS.border,
  });
  y -= 10;

  return y;
}

/** Bordered, shaded table header row. Returns the y cursor after the row. */
export function drawTableHeaderRow(
  page: PDFPage,
  theme: PdfTheme,
  columns: { label: string; align?: "left" | "right" }[],
  widths: number[],
  x0: number,
  y: number,
): number {
  const { bold } = theme;
  const rowHeight = 20;
  page.drawRectangle({
    x: x0,
    y: y - rowHeight,
    width: widths.reduce((a, b) => a + b, 0),
    height: rowHeight,
    color: PDF_COLORS.zebraMid,
    borderColor: PDF_COLORS.border,
    borderWidth: 0.75,
  });
  let x = x0;
  columns.forEach((col, i) => {
    const width = widths[i]!;
    const label = truncate(col.label.toUpperCase(), 40);
    const textX =
      col.align === "right" ? x + width - 6 - bold.widthOfTextAtSize(label, 8) : x + 6;
    page.drawText(label, { x: Math.max(x + 6, textX), y: y - 13, size: 8, font: bold, color: PDF_COLORS.muted });
    x += width;
  });
  return y - rowHeight;
}

/** Bordered table row with optional zebra striping. Returns the y cursor after the row. */
export function drawTableRow(
  page: PDFPage,
  theme: PdfTheme,
  cells: { value: string; align?: "left" | "right" }[],
  widths: number[],
  x0: number,
  y: number,
  opts: { zebra?: boolean; bold?: boolean; rowHeight?: number } = {},
): number {
  const { regular, bold } = theme;
  const font = opts.bold ? bold : regular;
  const rowHeight = opts.rowHeight ?? 18;
  const totalWidth = widths.reduce((a, b) => a + b, 0);
  if (opts.zebra) {
    page.drawRectangle({
      x: x0,
      y: y - rowHeight,
      width: totalWidth,
      height: rowHeight,
      color: PDF_COLORS.zebraLight,
    });
  }
  page.drawRectangle({
    x: x0,
    y: y - rowHeight,
    width: totalWidth,
    height: rowHeight,
    borderColor: PDF_COLORS.border,
    borderWidth: 0.5,
    color: undefined,
  });
  let x = x0;
  const size = 8.5;
  cells.forEach((cell, i) => {
    const width = widths[i]!;
    const value = truncate(cell.value, 72);
    const textX = cell.align === "right" ? x + width - 6 - font.widthOfTextAtSize(value, size) : x + 6;
    page.drawText(value, {
      x: Math.max(x + 6, textX),
      y: y - rowHeight + (rowHeight - size) / 2 + 1,
      size,
      font,
      color: PDF_COLORS.text,
    });
    x += width;
  });
  return y - rowHeight;
}

/** Totals row — visually distinct from line items (tinted fill, bold, thicker top border). */
export function drawTotalsRow(
  page: PDFPage,
  theme: PdfTheme,
  cells: { value: string; align?: "left" | "right" }[],
  widths: number[],
  x0: number,
  y: number,
): number {
  const { bold } = theme;
  const rowHeight = 20;
  const totalWidth = widths.reduce((a, b) => a + b, 0);
  page.drawRectangle({
    x: x0,
    y: y - rowHeight,
    width: totalWidth,
    height: rowHeight,
    color: PDF_COLORS.totalsBg,
    borderColor: PDF_COLORS.cobalt,
    borderWidth: 1,
  });
  let x = x0;
  const size = 9;
  cells.forEach((cell, i) => {
    const width = widths[i]!;
    const value = truncate(cell.value, 72);
    const textX = cell.align === "right" ? x + width - 6 - bold.widthOfTextAtSize(value, size) : x + 6;
    page.drawText(value, {
      x: Math.max(x + 6, textX),
      y: y - rowHeight + (rowHeight - size) / 2 + 1,
      size,
      font: bold,
      color: PDF_COLORS.navy,
    });
    x += width;
  });
  return y - rowHeight;
}

/** Status pill matching the on-screen Badge tones — never conveys state by color alone; pass a text label. */
export function drawStatusPill(
  page: PDFPage,
  theme: PdfTheme,
  label: string,
  tone: PdfStatusTone,
  x: number,
  y: number,
) {
  const { bold } = theme;
  const size = 7.5;
  const colors = PDF_COLORS.status[tone];
  const textWidth = bold.widthOfTextAtSize(label.toUpperCase(), size);
  const paddingX = 6;
  const width = textWidth + paddingX * 2;
  const height = 13;
  page.drawRectangle({ x, y, width, height, color: colors.bg, borderColor: colors.fg, borderWidth: 0.5 });
  page.drawText(label.toUpperCase(), {
    x: x + paddingX,
    y: y + 3,
    size,
    font: bold,
    color: colors.fg,
  });
}

/**
 * Bordered, shaded info block (matches the on-screen InfoBlock card) — a
 * label plus stacked lines, used for landlord/tenant/property/payer blocks
 * on letter-style formal documents (rent receipts, 1099s). Returns the y
 * cursor after the block.
 */
export function drawInfoBlock(
  page: PDFPage,
  theme: PdfTheme,
  opts: { label: string; lines: string[]; x: number; y: number; width: number },
): number {
  const { regular, bold } = theme;
  const visibleLines = opts.lines.filter(Boolean);
  const paddingY = 8;
  const labelHeight = 12;
  const lineHeight = 12;
  const height = infoBlockHeight(opts.lines);
  page.drawRectangle({
    x: opts.x,
    y: opts.y - height,
    width: opts.width,
    height,
    color: PDF_COLORS.zebraLight,
    borderColor: PDF_COLORS.border,
    borderWidth: 0.75,
  });
  let cursorY = opts.y - paddingY - 8;
  drawText(page, opts.label.toUpperCase(), opts.x + 10, cursorY, 7.5, bold, PDF_COLORS.muted, opts.width - 20);
  cursorY -= labelHeight;
  for (const line of visibleLines) {
    drawText(page, line, opts.x + 10, cursorY, 9, regular, PDF_COLORS.navy, opts.width - 20);
    cursorY -= lineHeight;
  }
  return opts.y - height;
}

/**
 * Highlighted key/value line (tinted cobalt-bordered box) for a single
 * standout figure — e.g. "Amount received" on a rent receipt or "Box 1 —
 * Nonemployee compensation" on a 1099. Same visual language as
 * {@link drawTotalsRow} so a form document and a tabular report read as one
 * system. Returns the y cursor after the box.
 */
export function drawHighlightLine(
  page: PDFPage,
  theme: PdfTheme,
  opts: { label: string; value: string; x: number; y: number; width: number },
): number {
  const { regular, bold } = theme;
  const height = 30;
  page.drawRectangle({
    x: opts.x,
    y: opts.y - height,
    width: opts.width,
    height,
    color: PDF_COLORS.totalsBg,
    borderColor: PDF_COLORS.cobalt,
    borderWidth: 1,
  });
  drawText(page, opts.label.toUpperCase(), opts.x + 12, opts.y - 13, 7.5, regular, PDF_COLORS.muted);
  drawText(page, opts.value, opts.x + 12, opts.y - 25, 14, bold, PDF_COLORS.navy);
  return opts.y - height;
}

/** Standard confidentiality footer + page X of Y, applied to every page after content is drawn. */
export function drawStandardFooter(theme: PdfTheme, contentWidth: number) {
  const { pdf, regular, italic } = theme;
  const margin = PDF_PAGE.margin;
  const pages = pdf.getPages();
  pages.forEach((page, index) => {
    drawWrappedText(
      page,
      "This document was prepared from Axis property records for management, tax, and audit purposes. Confidential — retain with supporting bank statements.",
      margin,
      PDF_PAGE.footerY + 20,
      7.5,
      italic,
      contentWidth,
      PDF_COLORS.muted,
    );
    page.drawText(`Page ${index + 1} of ${pages.length}`, {
      x: margin,
      y: PDF_PAGE.footerY,
      size: 8,
      font: regular,
      color: PDF_COLORS.muted,
    });
  });
}

export { truncate };
