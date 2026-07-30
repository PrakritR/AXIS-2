const H2_HEADING_RE = /<h2\b[^>]*>[\s\S]*?<\/h2>/gi;

export type LeaseHtmlSection = {
  id: string;
  title: string;
  headingHtml: string;
  bodyHtml: string;
};

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

/** Split generated lease HTML into editable sections (each `<h2>` block + following body). */
export function parseLeaseHtmlSections(html: string): LeaseHtmlSection[] {
  if (!html.trim()) return [];

  const headings: Array<{ headingHtml: string; index: number }> = [];
  for (const match of html.matchAll(H2_HEADING_RE)) {
    if (match.index == null) continue;
    headings.push({ headingHtml: match[0], index: match.index });
  }
  if (!headings.length) return [];

  const slugCounts = new Map<string, number>();
  return headings.map((heading, idx) => {
    const bodyStart = heading.index + heading.headingHtml.length;
    const bodyEnd = headings[idx + 1]?.index ?? html.length;
    const bodyHtml = html.slice(bodyStart, bodyEnd);
    const title = decodeBasicEntities(stripHtmlTags(heading.headingHtml));
    const baseSlug = slugifySectionTitle(title) || `section-${idx + 1}`;
    const seen = slugCounts.get(baseSlug) ?? 0;
    slugCounts.set(baseSlug, seen + 1);
    const id = seen === 0 ? baseSlug : `${baseSlug}-${seen + 1}`;
    return {
      id,
      title,
      headingHtml: heading.headingHtml,
      bodyHtml,
    };
  });
}

/** Rebuild full lease HTML from the document head plus edited section bodies. */
export function rebuildLeaseHtmlFromSections(
  originalHtml: string,
  sections: readonly Pick<LeaseHtmlSection, "headingHtml" | "bodyHtml">[],
): string {
  const parsed = parseLeaseHtmlSections(originalHtml);
  if (!parsed.length || parsed.length !== sections.length) {
    return originalHtml;
  }
  const firstHeadingIndex = originalHtml.search(/<h2\b/i);
  const head = firstHeadingIndex >= 0 ? originalHtml.slice(0, firstHeadingIndex) : "";
  const body = sections.map((section, idx) => `${parsed[idx]!.headingHtml}${section.bodyHtml}`).join("");
  return `${head}${body}`;
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
