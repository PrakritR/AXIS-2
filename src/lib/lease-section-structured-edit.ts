function stripInnerHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type LeaseSectionEditablePart =
  | {
      kind: "table-row";
      id: string;
      label: string;
      value: string;
      originalHtml: string;
    }
  | {
      kind: "paragraph";
      id: string;
      text: string;
      originalHtml: string;
    }
  | {
      kind: "list-item";
      id: string;
      text: string;
      originalHtml: string;
    }
  | {
      kind: "raw";
      id: string;
      html: string;
      originalHtml: string;
    };

const BLOCK_TOKEN_RE = /<tr[^>]*>[\s\S]*?<\/tr>|<p[^>]*>[\s\S]*?<\/p>|<li[^>]*>[\s\S]*?<\/li>/gi;

function parseTableRow(html: string): { label: string; value: string } | null {
  const thMatch = html.match(/<th[^>]*>([\s\S]*?)<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/i);
  if (thMatch) {
    return { label: stripInnerHtml(thMatch[1]!), value: stripInnerHtml(thMatch[2]!) };
  }
  const tdMatch = html.match(/<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i);
  if (tdMatch) {
    return { label: stripInnerHtml(tdMatch[1]!), value: stripInnerHtml(tdMatch[2]!) };
  }
  return null;
}

function rebuildTableRowHtml(part: Extract<LeaseSectionEditablePart, { kind: "table-row" }>): string {
  if (/<th/i.test(part.originalHtml)) {
    return part.originalHtml
      .replace(/<th[^>]*>[\s\S]*?<\/th>/i, `<th>${escapeHtmlText(part.label)}</th>`)
      .replace(/<td[^>]*>[\s\S]*?<\/td>/i, `<td>${escapeHtmlText(part.value)}</td>`);
  }
  let replaced = 0;
  return part.originalHtml.replace(/<td[^>]*>[\s\S]*?<\/td>/gi, (match) => {
    replaced += 1;
    if (replaced === 1) return match.replace(/>([\s\S]*?)<\/td>/i, `>${escapeHtmlText(part.label)}</td>`);
    if (replaced === 2) return match.replace(/>([\s\S]*?)<\/td>/i, `>${escapeHtmlText(part.value)}</td>`);
    return match;
  });
}

function rebuildParagraphHtml(part: Extract<LeaseSectionEditablePart, { kind: "paragraph" }>): string {
  return part.originalHtml.replace(/>([\s\S]*?)<\/p>/i, `>${escapeHtmlText(part.text).replace(/\n/g, "<br>")}</p>`);
}

function rebuildListItemHtml(part: Extract<LeaseSectionEditablePart, { kind: "list-item" }>): string {
  return part.originalHtml.replace(/>([\s\S]*?)<\/li>/i, `>${escapeHtmlText(part.text).replace(/\n/g, "<br>")}</li>`);
}

/** Split a section body into labeled fields, paragraphs, and list items for manual editing. */
export function parseLeaseSectionEditableParts(bodyHtml: string): LeaseSectionEditablePart[] {
  const trimmed = bodyHtml.trim();
  if (!trimmed) return [];

  const parts: LeaseSectionEditablePart[] = [];
  let cursor = 0;
  let index = 0;
  const matches = [...trimmed.matchAll(BLOCK_TOKEN_RE)];

  for (const match of matches) {
    const token = match[0];
    const start = match.index ?? 0;
    if (start > cursor) {
      const gap = trimmed.slice(cursor, start).trim();
      if (gap) {
        parts.push({
          kind: "raw",
          id: `raw-${index++}`,
          html: gap,
          originalHtml: gap,
        });
      }
    }

    const tableRow = parseTableRow(token);
    if (tableRow) {
      parts.push({
        kind: "table-row",
        id: `row-${index++}`,
        label: tableRow.label,
        value: tableRow.value,
        originalHtml: token,
      });
    } else if (/^<p\b/i.test(token)) {
      parts.push({
        kind: "paragraph",
        id: `p-${index++}`,
        text: stripInnerHtml(token),
        originalHtml: token,
      });
    } else if (/^<li\b/i.test(token)) {
      parts.push({
        kind: "list-item",
        id: `li-${index++}`,
        text: stripInnerHtml(token),
        originalHtml: token,
      });
    } else {
      parts.push({
        kind: "raw",
        id: `raw-${index++}`,
        html: token,
        originalHtml: token,
      });
    }
    cursor = start + token.length;
  }

  const tail = trimmed.slice(cursor).trim();
  if (tail) {
    parts.push({
      kind: "raw",
      id: `raw-${index++}`,
      html: tail,
      originalHtml: tail,
    });
  }

  if (!parts.length) {
    parts.push({
      kind: "raw",
      id: "raw-0",
      html: trimmed,
      originalHtml: trimmed,
    });
  }

  return parts;
}

export function rebuildPartHtml(part: LeaseSectionEditablePart): string {
  switch (part.kind) {
    case "table-row":
      return rebuildTableRowHtml(part);
    case "paragraph":
      return rebuildParagraphHtml(part);
    case "list-item":
      return rebuildListItemHtml(part);
    case "raw":
      return part.html;
    default:
      return part.originalHtml;
  }
}

/** Rebuild the full section body HTML from structured parts (preserves block order). */
export function rebuildBodyHtmlFromParts(parts: readonly LeaseSectionEditablePart[]): string {
  return parts.map((part) => rebuildPartHtml(part)).join("");
}

/** Apply structured field edits back into the section HTML body. */
export function applyLeaseSectionEditablePartEdits(
  bodyHtml: string,
  parts: readonly LeaseSectionEditablePart[],
): string {
  let next = bodyHtml;
  for (const part of parts) {
    const rebuilt = rebuildPartHtml(part);
    if (rebuilt === part.originalHtml) continue;
    if (!next.includes(part.originalHtml)) continue;
    next = next.replace(part.originalHtml, rebuilt);
  }
  return next;
}

export function leaseSectionHasStructuredFields(parts: readonly LeaseSectionEditablePart[]): boolean {
  return parts.some((part) => part.kind !== "raw");
}
