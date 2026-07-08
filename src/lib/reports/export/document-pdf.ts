/**
 * Render an HTML document (lease, template merge output, notice) into a branded
 * PDF using the shared Blue Steel pdf-theme. pdf-lib does not render HTML, so
 * this flattens the markup into ordered text blocks (headings vs. paragraphs vs.
 * list items) and lays them out with the theme's header/footer/wrapping — a
 * real, valid, branded PDF rather than a pixel-perfect browser render. Used by
 * the document-template output and the lease auto-file hook.
 */
import { PDF_COLORS, PDF_PAGE, createPdfTheme, drawDocumentHeader, drawStandardFooter, drawWrappedText, ensurePageSpace, wrappedTextHeight } from "@/lib/reports/export/pdf-theme";

type Block = { kind: "heading" | "subheading" | "paragraph" | "listItem"; text: string };

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
  "&mdash;": "—",
  "&ndash;": "–",
};

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&[a-z]+;|&#39;/gi, (m) => ENTITIES[m.toLowerCase()] ?? m);
}

/** Flatten HTML markup into ordered, tag-free text blocks for layout. */
export function htmlToBlocks(html: string): Block[] {
  const blocks: Block[] = [];
  // Normalize line-break tags to newlines before stripping.
  const withBreaks = html
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*\/\s*(p|div|tr|section|header|footer|table)\s*>/gi, "\n");
  const tagPattern = /<(h1|h2|h3|h4|li|p)[^>]*>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;
  let matchedAny = false;
  while ((match = tagPattern.exec(withBreaks)) !== null) {
    matchedAny = true;
    const tag = match[1]!.toLowerCase();
    const inner = decodeEntities(match[2]!.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    if (!inner) continue;
    if (tag === "h1") blocks.push({ kind: "heading", text: inner });
    else if (tag === "h2" || tag === "h3" || tag === "h4") blocks.push({ kind: "subheading", text: inner });
    else if (tag === "li") blocks.push({ kind: "listItem", text: inner });
    else blocks.push({ kind: "paragraph", text: inner });
  }
  if (!matchedAny) {
    // No block tags — treat as plain text split on blank lines / newlines.
    for (const chunk of decodeEntities(withBreaks.replace(/<[^>]+>/g, " ")).split(/\n{1,}/)) {
      const text = chunk.replace(/\s+/g, " ").trim();
      if (text) blocks.push({ kind: "paragraph", text });
    }
  }
  return blocks;
}

export type RenderHtmlDocumentOptions = {
  title: string;
  subtitle?: string;
  html: string;
};

/** Render HTML into branded PDF bytes. */
export async function renderHtmlDocumentPdf(opts: RenderHtmlDocumentOptions): Promise<Uint8Array> {
  const theme = await createPdfTheme();
  const contentWidth = PDF_PAGE.width - PDF_PAGE.margin * 2;
  let page = theme.pdf.addPage([PDF_PAGE.width, PDF_PAGE.height]);
  let y = drawDocumentHeader(page, theme, { title: opts.title, subtitle: opts.subtitle, contentWidth });

  const blocks = htmlToBlocks(opts.html);
  if (blocks.length === 0) blocks.push({ kind: "paragraph", text: "(No content)" });

  for (const block of blocks) {
    const font = block.kind === "heading" || block.kind === "subheading" ? theme.bold : theme.regular;
    const size = block.kind === "heading" ? 13 : block.kind === "subheading" ? 11 : 9.5;
    const color = block.kind === "heading" || block.kind === "subheading" ? PDF_COLORS.navy : PDF_COLORS.text;
    const indent = block.kind === "listItem" ? 16 : 0;
    const text = block.kind === "listItem" ? `•  ${block.text}` : block.text;
    const maxWidth = contentWidth - indent;
    const needed = wrappedTextHeight(font, text, size, maxWidth) + (block.kind === "paragraph" ? 6 : 8);

    const space = ensurePageSpace(theme, page, y, needed);
    page = space.page;
    y = space.y;

    y = drawWrappedText(page, text, PDF_PAGE.margin + indent, y, size, font, maxWidth, color, size + 4);
    y -= block.kind === "heading" ? 6 : 4;
  }

  drawStandardFooter(theme, contentWidth);
  return theme.pdf.save();
}
