const H2_HEADING_RE = /<h2\b[^>]*>[\s\S]*?<\/h2>/gi;

export type LeaseHtmlSection = {
  id: string;
  title: string;
  headingHtml: string;
  bodyHtml: string;
};

const LEASE_DOCUMENT_HEADER_ID = "lease-document-header";

/** Pull embedded `<style>` rules so section visual editors match the lease PDF. */
export function extractLeaseDocumentStyles(html: string): string {
  const match = html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  return match?.[1]?.trim() ?? "";
}

function stripHtmlTags(value: string): string {
  return value.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function decodeBasicEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function slugifySectionTitle(title: string): string {
  return decodeBasicEntities(stripHtmlTags(title))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Split generated lease HTML into editable sections (preamble + each `<h2>` block). */
export function parseLeaseHtmlSections(html: string): LeaseHtmlSection[] {
  if (!html.trim()) return [];

  const headings: Array<{ headingHtml: string; index: number }> = [];
  for (const match of html.matchAll(H2_HEADING_RE)) {
    if (match.index == null) continue;
    headings.push({ headingHtml: match[0], index: match.index });
  }
  if (!headings.length) return [];

  const firstHeadingIndex = headings[0]!.index;
  const sections: LeaseHtmlSection[] = [];
  const preamble = html.slice(0, firstHeadingIndex).trim();
  if (preamble) {
    sections.push({
      id: LEASE_DOCUMENT_HEADER_ID,
      title: "Lease header & summary",
      headingHtml: "",
      bodyHtml: html.slice(0, firstHeadingIndex),
    });
  }

  const slugCounts = new Map<string, number>();
  headings.forEach((heading, idx) => {
    const bodyStart = heading.index + heading.headingHtml.length;
    const bodyEnd = headings[idx + 1]?.index ?? html.length;
    const bodyHtml = html.slice(bodyStart, bodyEnd);
    const title = decodeBasicEntities(stripHtmlTags(heading.headingHtml));
    const baseSlug = slugifySectionTitle(title) || `section-${idx + 1}`;
    const seen = slugCounts.get(baseSlug) ?? 0;
    slugCounts.set(baseSlug, seen + 1);
    const id = seen === 0 ? baseSlug : `${baseSlug}-${seen + 1}`;
    sections.push({
      id,
      title,
      headingHtml: heading.headingHtml,
      bodyHtml,
    });
  });
  return sections;
}

/** Rebuild full lease HTML from the document head plus edited section bodies. */
export function rebuildLeaseHtmlFromSections(
  originalHtml: string,
  sections: readonly Pick<LeaseHtmlSection, "id" | "headingHtml" | "bodyHtml">[],
): string {
  const parsed = parseLeaseHtmlSections(originalHtml);
  if (!parsed.length || parsed.length !== sections.length) {
    return originalHtml;
  }

  let preamble = "";
  let offset = 0;
  if (parsed[0]?.id === LEASE_DOCUMENT_HEADER_ID) {
    preamble = sections[0]?.bodyHtml ?? "";
    offset = 1;
  } else {
    const firstHeadingIndex = originalHtml.search(/<h2\b/i);
    preamble = firstHeadingIndex >= 0 ? originalHtml.slice(0, firstHeadingIndex) : "";
  }

  const body = sections
    .slice(offset)
    .map((section, idx) => `${parsed[offset + idx]!.headingHtml}${section.bodyHtml}`)
    .join("");
  return `${preamble}${body}`;
}

export function applyLeaseSectionBodyEdits(
  originalHtml: string,
  edits: Readonly<Record<string, string>>,
): string {
  const parsed = parseLeaseHtmlSections(originalHtml);
  if (!parsed.length) return originalHtml;
  const next = parsed.map((section) =>
    edits[section.id] !== undefined ? { ...section, bodyHtml: edits[section.id]! } : section,
  );
  return rebuildLeaseHtmlFromSections(originalHtml, next);
}
