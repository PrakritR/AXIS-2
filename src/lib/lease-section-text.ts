/**
 * Manager-authored lease section content.
 *
 * A manager edits a section as PLAIN TEXT by default, or opts that section into light
 * formatting. Neither mode accepts HTML. The value is escaped FIRST and every tag in the
 * output is one this module emits, so there is nothing for a sanitizer to allow or deny and
 * no parser for a payload to disagree with.
 *
 * That is the whole point. Four review rounds against an allowlist sanitizer each found a way
 * through it, all of them turning on markup the manager supplied. A manager who cannot supply
 * markup cannot smuggle any: `<style>` cannot hide a required clause, an unclosed `<style>`
 * cannot truncate the document, and a decoy `data-disclosure-rule` cannot be forged, because
 * none of those can be typed into either mode.
 *
 * The generated lease keeps its own richer vocabulary (its stylesheet, its tables, the
 * manager-template embed). Those come from the builder, not from a person, which is exactly
 * the trust distinction the single shared allowlist used to blur.
 */

/** How a manager wrote a section. `text` is the default and needs no formatting knowledge. */
export type LeaseSectionFormat = "text" | "rich";

export type LeaseSectionEdit = {
  format: LeaseSectionFormat;
  value: string;
};

/** Sections whose body is computed, not written. Editing them would break other invariants. */
/** Mirrors LEASE_DOCUMENT_HEADER_ID in lease-html-sections.ts, kept local to stay pure. */
const LEASE_DOCUMENT_HEADER_SECTION_ID = "lease-document-header";

const LEDGER_DERIVED_SECTION_PATTERNS = [
  /rent\s*&?\s*fees schedule/i,
  /exhibit a/i,
  /summary/i,
  /application summary/i,
];

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Inline formatting, applied to text that is ALREADY escaped. `**bold**` and `*italic*` only.
 * Because the input is escaped, the only `<` in the result are the ones written here.
 */
function applyInlineFormatting(escaped: string): string {
  return escaped
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
}

/** Plain text: paragraphs on blank lines, line breaks inside them, nothing else. */
export function renderSectionText(value: string): string {
  const paragraphs = value
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  if (!paragraphs.length) return "";
  return paragraphs.map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br/>")}</p>`).join("\n");
}

/**
 * Light formatting from a small markdown subset. Every tag below is emitted by this function;
 * the manager's own characters are escaped before any of it runs, so `<script>` arrives here
 * as `&lt;script&gt;` and leaves as visible text on the lease.
 *
 * Deliberately NOT supported: links, images, raw HTML, inline styles, classes, ids, tables.
 * A link or an image would reintroduce a URL to validate, and a table belongs to the
 * generated document rather than to prose a manager types.
 */
export function renderSectionRich(value: string): string {
  const lines = value.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let paragraph: string[] = [];

  const closeList = () => {
    if (listType) {
      out.push(`</${listType}>`);
      listType = null;
    }
  };
  const closeParagraph = () => {
    if (!paragraph.length) return;
    const body = paragraph.map((line) => applyInlineFormatting(escapeHtml(line))).join("<br/>");
    out.push(`<p>${body}</p>`);
    paragraph = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      closeParagraph();
      closeList();
      continue;
    }
    if (/^---+$/.test(trimmed)) {
      closeParagraph();
      closeList();
      out.push("<hr/>");
      continue;
    }
    const heading = trimmed.match(/^(#{3,4})\s+(.*)$/);
    if (heading) {
      closeParagraph();
      closeList();
      const level = heading[1]!.length === 3 ? "h3" : "h4";
      out.push(`<${level}>${applyInlineFormatting(escapeHtml(heading[2]!.trim()))}</${level}>`);
      continue;
    }
    const bullet = trimmed.match(/^[-*]\s+(.*)$/);
    const numbered = trimmed.match(/^\d+[.)]\s+(.*)$/);
    if (bullet || numbered) {
      closeParagraph();
      const wanted: "ul" | "ol" = bullet ? "ul" : "ol";
      if (listType !== wanted) {
        closeList();
        out.push(`<${wanted}>`);
        listType = wanted;
      }
      const item = (bullet ? bullet[1] : numbered![1]) ?? "";
      out.push(`<li>${applyInlineFormatting(escapeHtml(item.trim()))}</li>`);
      continue;
    }
    closeList();
    paragraph.push(trimmed);
  }
  closeParagraph();
  closeList();
  return out.join("\n");
}

/** Render a stored edit in whichever mode the manager chose. */
export function renderLeaseSectionEdit(edit: LeaseSectionEdit): string {
  return edit.format === "rich" ? renderSectionRich(edit.value) : renderSectionText(edit.value);
}

/**
 * Seed an editor from a section's existing HTML body. Block boundaries become blank lines and
 * list items become dashes, so the round trip through `renderSectionRich` is recognisable.
 * Lossy on purpose: a table cannot survive, which is one reason ledger-derived sections are
 * excluded from editing entirely.
 */
export function sectionSourceFromHtml(html: string): string {
  return html
    .replace(/<\s*(?:br|hr)\s*\/?>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "\n- ")
    .replace(/<\/\s*(?:p|div|h[1-6]|li|ul|ol|tr|table|blockquote)\s*>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * True when a section may be edited at all.
 *
 * This is the structural replacement for guarding statutory text after the fact. A clause the
 * disclosure engine inserted verbatim is not protected by a check that runs on save; it is
 * simply never offered to an editor, in either mode, so there is no save to check.
 */
export function isEditableLeaseSection(section: { id: string; title: string; bodyHtml: string }): boolean {
  if (/data-disclosure-rule=/i.test(section.bodyHtml)) return false;
  if (/electronic signature/i.test(section.title)) return false;
  // The preamble is not prose. It carries the Lease Summary block: monthly rent, utilities,
  // total monthly payment, deposit, move-in fee, payment due at signing. Every one of those is
  // computed from the ledger, so an editable header is a direct route to a lease that states a
  // different number than the resident is charged. Excluded by ID, because its title has been
  // "Lease header & summary" and a title pattern would not have caught it.
  if (section.id === LEASE_DOCUMENT_HEADER_SECTION_ID) return false;
  return !LEDGER_DERIVED_SECTION_PATTERNS.some((pattern) => pattern.test(section.title));
}

export function editableLeaseSections<T extends { id: string; title: string; bodyHtml: string }>(
  sections: readonly T[],
): T[] {
  return sections.filter(isEditableLeaseSection);
}
