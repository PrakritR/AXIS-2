/**
 * The generated lease is rendered in an iframe for the resident and may be
 * exported as HTML. Manager edits therefore need a deliberately small HTML
 * language, not a browser's full document language.
 *
 * This module is dependency-free so the same policy runs in the browser store
 * and in the Node route handler before row_data is persisted.
 */

const ALLOWED_TAGS = new Set([
  "html",
  "head",
  "body",
  "title",
  "meta",
  "style",
  "h1",
  "h2",
  "h3",
  "h4",
  "p",
  "div",
  "section",
  "span",
  "strong",
  "em",
  "b",
  "i",
  "br",
  "hr",
  "ul",
  "ol",
  "li",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "blockquote",
  "sup",
  "sub",
]);

const ALLOWED_ATTRIBUTES = new Set([
  "class",
  "id",
  "lang",
  "dir",
  "style",
  "colspan",
  "rowspan",
  "width",
  "height",
  "scope",
  "charset",
  "name",
  "content",
]);

const BLOCKED_ELEMENTS = /<(?:script|iframe|object|embed|link|base|img|image|svg|math|form|input|button|audio|video|source|track|canvas|template)\b[^>]*>[\s\S]*?<\/(?:script|iframe|object|embed|link|base|img|image|svg|math|form|input|button|audio|video|source|track|canvas|template)\s*>/gi;
const BLOCKED_VOID_ELEMENTS = /<\/?(?:script|iframe|object|embed|link|base|img|image|svg|math|form|input|button|audio|video|source|track|canvas|template)\b[^>]*>/gi;
const TAG_TOKEN = /<!--[\s\S]*?-->|<\/?[A-Za-z][^>]*>/g;
const VERBATIM_COMMENT = /^<!--\s*proplane-verbatim-disclosure:(?:start|end)(?::[A-Za-z0-9_-]+)?\s*-->$/i;
const VERBATIM_BLOCK = /<!--\s*proplane-verbatim-disclosure:start(?::([A-Za-z0-9_-]+))?\s*-->([\s\S]*?)<!--\s*proplane-verbatim-disclosure:end(?::\1)?\s*-->/gi;

function isSafeCss(value: string): boolean {
  // CSS escapes would turn a string-only denylist into an external-load bypass.
  // The generated lease CSS uses neither escapes nor URL-bearing declarations.
  return !/\\|\0|<|>|https?:|\/\/|url\s*\(|(?:-webkit-)?image-set\s*\(|cross-fade\s*\(|@(?:import|font-face|namespace|document|page)\b|(?:expression|behavior|-moz-binding)\b|(?:javascript|vbscript|data)\s*:/i.test(
    value,
  );
}

function stripUnclosedStyleTail(value: string): string {
  const opens = [...value.matchAll(/<style\b[^>]*>/gi)];
  const lastOpen = opens.at(-1)?.index ?? -1;
  const closes = [...value.matchAll(/<\/style\s*>/gi)];
  const lastClose = closes.at(-1)?.index ?? -1;
  return lastOpen > lastClose ? value.slice(0, lastOpen) : value;
}

function sanitizeAttribute(name: string, value: string, tagName: string): string | null {
  const normalized = name.toLowerCase();
  if (!ALLOWED_ATTRIBUTES.has(normalized) || normalized.startsWith("on")) return null;
  if (normalized === "charset" || normalized === "name" || normalized === "content") {
    if (tagName !== "meta") return null;
  }
  if (normalized === "style") {
    return isSafeCss(value) ? ` style="${escapeAttribute(value)}"` : null;
  }
  return value ? ` ${normalized}="${escapeAttribute(value)}"` : ` ${normalized}`;
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function sanitizeTag(token: string): string {
  if (token.startsWith("<!--")) return VERBATIM_COMMENT.test(token) ? token : "";
  const closing = /^<\//.test(token);
  const match = token.match(/^<\/?\s*([A-Za-z0-9-]+)/);
  const tagName = match?.[1]?.toLowerCase();
  if (!tagName || !ALLOWED_TAGS.has(tagName)) return "";
  if (closing) return `</${tagName}>`;

  const rawAttributes = token.slice(match![0].length, token.endsWith("/>") ? -2 : -1);
  const attributes: string[] = [];
  const attributePattern = /([^\s="'<>`/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const attribute of rawAttributes.matchAll(attributePattern)) {
    const name = attribute[1] ?? "";
    const value = attribute[2] ?? attribute[3] ?? attribute[4] ?? "";
    const safe = sanitizeAttribute(name, value, tagName);
    if (safe) attributes.push(safe);
  }
  return `<${tagName}${attributes.join("")}>`;
}

/** Whether the input already fits the document allowlist without byte changes. */
function isAlreadySafeLeaseDocument(value: string): boolean {
  if (BLOCKED_VOID_ELEMENTS.test(value)) return false;
  BLOCKED_VOID_ELEMENTS.lastIndex = 0;
  const styleBlocks = [...value.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)];
  const styleOpenCount = [...value.matchAll(/<style\b[^>]*>/gi)].length;
  if (styleBlocks.length !== styleOpenCount) return false;
  if (styleBlocks.some((match) => !isSafeCss(match[1] ?? ""))) return false;
  for (const token of value.matchAll(TAG_TOKEN)) {
    const source = token[0];
    if (source.startsWith("<!--")) continue;
    const sanitized = sanitizeTag(source);
    if (!sanitized) return false;
    // Normalise only insignificant whitespace and a self-closing slash while
    // comparing. Returning the original below preserves the exact signed bytes.
    const normalizedSource = source.replace(/\s+/g, " ").replace(/\s*\/?>$/, ">");
    const normalizedSanitized = sanitized.replace(/\s+/g, " ");
    if (normalizedSource !== normalizedSanitized) return false;
  }
  return true;
}

/** Remove executable markup, event handlers, URLs, and resource-loading tags. */
export function sanitizeLeaseDocumentHtml(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  if (isAlreadySafeLeaseDocument(value)) return value;
  const withoutBlockedElements = stripUnclosedStyleTail(value)
    .replace(BLOCKED_ELEMENTS, "")
    .replace(BLOCKED_VOID_ELEMENTS, "")
    .replace(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi, (block, css: string) => (isSafeCss(css) ? block : ""));
  const sanitized = withoutBlockedElements.replace(TAG_TOKEN, sanitizeTag);
  return sanitized.trim() || null;
}

type VerbatimClauseResult = { ok: true; html: string } | { ok: false; error: string };

/**
 * P7 supplies immutable clauses inside these comments. A manager may edit the
 * surrounding document but cannot remove or rewrite a marked clause. P7 has
 * not landed yet, so unmarked generated leases remain editable today.
 */
export function preserveVerbatimDisclosureClauses(originalHtml: string, editedHtml: string): VerbatimClauseResult {
  const originals = [...originalHtml.matchAll(VERBATIM_BLOCK)];
  if (originals.length === 0) return { ok: true, html: editedHtml };
  const edited = [...editedHtml.matchAll(VERBATIM_BLOCK)];
  if (edited.length !== originals.length) {
    return { ok: false, error: "Required disclosure clauses cannot be removed. Edit the surrounding text only." };
  }
  const originalKeys = originals.map((match, index) => match[1] || String(index));
  const editedKeys = edited.map((match, index) => match[1] || String(index));
  if (originalKeys.some((key, index) => key !== editedKeys[index])) {
    return { ok: false, error: "Required disclosure clauses must remain in place and unchanged." };
  }
  let index = 0;
  const restored = editedHtml.replace(VERBATIM_BLOCK, () => originals[index++]![0]);
  return { ok: true, html: restored };
}

/** Apply the persisted allowlist after restoring any P7 immutable disclosure blocks. */
export function sanitizeManagerLeaseDocumentEdit(originalHtml: string, editedHtml: string): VerbatimClauseResult {
  const protectedClauses = preserveVerbatimDisclosureClauses(originalHtml, editedHtml);
  if (!protectedClauses.ok) return protectedClauses;
  const html = sanitizeLeaseDocumentHtml(protectedClauses.html);
  return html ? { ok: true, html } : { ok: false, error: "Lease HTML must contain allowed document content." };
}
