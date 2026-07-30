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

/**
 * Prefix lease document CSS so it can be embedded in the portal without leaking `body` / `html` rules.
 * Prefer an isolated iframe editor when possible; this helper is for tests and narrow fallbacks.
 */
export function scopeLeaseDocumentStyles(css: string, scopeSelector: string): string {
  const trimmed = css.trim();
  if (!trimmed) return "";

  const scopeSelectors = (selectors: string): string =>
    selectors
      .split(",")
      .map((raw) => {
        const selector = raw.trim();
        if (!selector) return selector;
        if (selector === "body" || selector === "html") return scopeSelector;
        if (selector.startsWith("body ") || selector.startsWith("html ")) {
          return `${scopeSelector} ${selector.replace(/^(body|html)\s+/, "")}`;
        }
        return `${scopeSelector} ${selector}`;
      })
      .join(", ");

  return trimmed.replace(/(^|})\s*([^@{}][^{]*)\{/g, (_match, before: string, selectors: string) => {
    return `${before} ${scopeSelectors(selectors)} {`;
  });
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

/** Insert a new `<h2>` section immediately before the first existing section heading. */
export function prependLeaseHtmlSection(
  html: string,
  section: { title: string; bodyHtml: string },
): string {
  const block = `<h2>${section.title}</h2>${section.bodyHtml}`;
  const firstH2 = html.search(/<h2\b/i);
  if (firstH2 < 0) return `${html}${block}`;
  return `${html.slice(0, firstH2)}${block}${html.slice(firstH2)}`;
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

const LEASE_PREVIEW_SECTION_STYLE = `
.lease-preview-section { transition: outline-color 0.15s ease, background-color 0.15s ease; }
.lease-preview-section:hover { outline: 2px dashed rgba(47, 107, 255, 0.45); outline-offset: 4px; background: rgba(47, 107, 255, 0.04); }
.lease-preview-section:focus { outline: 2px solid rgba(47, 107, 255, 0.7); outline-offset: 4px; }
.lease-visual-section-active { outline: 2px solid rgba(47, 107, 255, 0.75) !important; outline-offset: 4px; background: rgba(47, 107, 255, 0.06) !important; }
`;

const LEASE_PREVIEW_SECTION_SCRIPT = `
<script>
(function () {
  function bind() {
    document.querySelectorAll("[data-lease-section-id]").forEach(function (el) {
      if (el.getAttribute("data-lease-bound") === "1") return;
      el.setAttribute("data-lease-bound", "1");
      el.setAttribute("tabindex", "0");
      el.style.cursor = "pointer";
      el.title = "Double-click to edit this section";
      el.addEventListener("dblclick", function (event) {
        event.preventDefault();
        event.stopPropagation();
        var sectionId = el.getAttribute("data-lease-section-id");
        if (!sectionId) return;
        document.querySelectorAll("[data-lease-section-id]").forEach(function (node) {
          node.classList.toggle("lease-visual-section-active", node.getAttribute("data-lease-section-id") === sectionId);
        });
        el.scrollIntoView({ block: "nearest", behavior: "smooth" });
        parent.postMessage({ type: "lease-preview-section-dblclick", sectionId: sectionId }, "*");
      });
    });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();
</script>`;

const LEASE_VISUAL_EDIT_EXTRA_STYLE = `
.lease-visual-section-active { outline: 2px solid rgba(47, 107, 255, 0.75) !important; outline-offset: 4px; background: rgba(47, 107, 255, 0.06) !important; }
body[contenteditable="true"] { outline: none; }
body[contenteditable="true"]:focus { outline: none; }
`;

const LEASE_VISUAL_EDIT_SCRIPT = `
<script>
(function () {
  function bind() {
    document.querySelectorAll("[data-lease-section-id]").forEach(function (el) {
      if (el.getAttribute("data-lease-bound") === "1") return;
      el.setAttribute("data-lease-bound", "1");
      el.setAttribute("title", "Double-click to edit this section");
      el.addEventListener("dblclick", function () {
        var sectionId = el.getAttribute("data-lease-section-id");
        if (!sectionId) return;
        document.querySelectorAll("[data-lease-section-id]").forEach(function (node) {
          node.classList.toggle("lease-visual-section-active", node.getAttribute("data-lease-section-id") === sectionId);
        });
        el.scrollIntoView({ block: "nearest", behavior: "smooth" });
        parent.postMessage({ type: "lease-visual-section-focus", sectionId: sectionId }, "*");
      });
    });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();
</script>`;

function injectLeaseSectionMarkers(
  html: string,
  options: { extraStyle: string; script: string },
): string {
  const sections = parseLeaseHtmlSections(html);
  if (!sections.length) return html;

  const styleBlock = `${LEASE_PREVIEW_SECTION_STYLE}${options.extraStyle}`;
  const styledHtml = html.includes("</head>")
    ? html.replace("</head>", `<style>${styleBlock}</style></head>`)
    : `<style>${styleBlock}</style>${html}`;

  let preamble = "";
  let offset = 0;
  if (sections[0]?.id === LEASE_DOCUMENT_HEADER_ID) {
    preamble = `<section class="lease-preview-section" data-lease-section-id="${sections[0]!.id}">${sections[0]!.bodyHtml}</section>`;
    offset = 1;
  } else {
    const firstHeadingIndex = styledHtml.search(/<h2\b/i);
    preamble = firstHeadingIndex >= 0 ? styledHtml.slice(0, firstHeadingIndex) : "";
  }

  const body = sections
    .slice(offset)
    .map(
      (section) =>
        `${section.headingHtml}<section class="lease-preview-section" data-lease-section-id="${section.id}">${section.bodyHtml}</section>`,
    )
    .join("");

  const merged = `${preamble}${body}`;
  return merged.includes("</body>")
    ? merged.replace("</body>", `${options.script}</body>`)
    : `${merged}${options.script}`;
}

/** Serialize a live editor document back to stored lease HTML. */
export function serializeLeaseEditorDocument(doc: Document): string {
  const doctype = doc.doctype;
  const prefix = doctype
    ? `<!DOCTYPE ${doctype.name}${doctype.publicId ? ` PUBLIC "${doctype.publicId}"` : ""}${doctype.systemId ? ` "${doctype.systemId}"` : ""}>\n`
    : "<!DOCTYPE html>\n";
  return `${prefix}${doc.documentElement.outerHTML}`;
}

/** Wrap each lease section for interactive preview (double-click posts section id to parent). */
export function injectLeasePreviewSectionMarkers(html: string): string {
  return injectLeaseSectionMarkers(html, {
    extraStyle: "",
    script: LEASE_PREVIEW_SECTION_SCRIPT,
  });
}

/** Full-document visual editor: section click posts focus; entire body is contentEditable in the host iframe. */
export function injectLeaseVisualEditDocument(html: string): string {
  return injectLeaseSectionMarkers(html, {
    extraStyle: LEASE_VISUAL_EDIT_EXTRA_STYLE,
    script: LEASE_VISUAL_EDIT_SCRIPT,
  });
}
