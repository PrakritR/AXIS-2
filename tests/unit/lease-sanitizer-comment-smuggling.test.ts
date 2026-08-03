// @vitest-environment jsdom
//
// A browser ends an HTML comment at `<!-->`, `<!--->` and `--!>`, not only at `-->`. The
// sanitizer's tokenizer modelled only `-->`, so everything after one of those closers was
// LIVE MARKUP to a resident's browser while the tokenizer saw one opaque comment, and the
// allowlist never ran on it. These are the payloads that got through.
import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { sanitizeLeaseDocumentHtml, sanitizeManagerLeaseDocumentEdit } from "@/lib/lease-document-sanitizer";

const PAYLOADS: Array<[string, string]> = [
  ["abrupt empty comment hiding a style onload", `<html><body><p>Lease</p><!--><style onload="alert(document.domain)">p{}</style> --></body></html>`],
  ["abrupt empty comment hiding a div onclick", `<html><body><p>Lease</p><!--> <div onclick="alert(1)">Rent</div> --></body></html>`],
  ["dash variant", `<html><body><!---><div onmouseover="alert(1)">x</div> --></body></html>`],
  ["--!> closer", `<html><body><!-- --!><div onclick="alert(1)">x</div> --></body></html>`],
];

/** What a real HTML parser, i.e. the resident's browser, actually materializes. */
function liveHandlerAttributes(html: string): string[] {
  const { document } = new JSDOM(html).window;
  const found: string[] = [];
  for (const el of Array.from(document.querySelectorAll("*"))) {
    for (const attr of Array.from(el.attributes)) {
      if (attr.name.toLowerCase().startsWith("on")) found.push(`${el.tagName}[${attr.name}]`);
    }
  }
  return found;
}

describe("lease sanitizer: comment-terminator smuggling", () => {
  it.each(PAYLOADS)("%s is neutralized on write", (_name, payload) => {
    // The payload really is dangerous before sanitizing, so this test cannot pass vacuously.
    expect(liveHandlerAttributes(payload).length).toBeGreaterThan(0);

    const cleaned = sanitizeLeaseDocumentHtml(payload) ?? "";
    expect(liveHandlerAttributes(cleaned)).toEqual([]);
    expect(cleaned).not.toMatch(/\son[a-z]+\s*=/i);
  });

  it.each(PAYLOADS)("%s cannot be saved through the manager edit path", (_name, payload) => {
    const base = "<html><body><p>Lease</p></body></html>";
    const result = sanitizeManagerLeaseDocumentEdit(base, payload);
    const stored = result.ok ? result.html : "";
    expect(liveHandlerAttributes(stored)).toEqual([]);
  });

  it("leaves an ordinary safe document byte-identical", () => {
    const safe = "<html><body><h1>Lease</h1><p>Rent is due on the 1st.</p></body></html>";
    expect(sanitizeLeaseDocumentHtml(safe)).toBe(safe);
  });
});

/**
 * The disclosure engine marks a legally required clause with `data-disclosure-rule`. The
 * protection was looking for comment markers that nothing emits, and the sanitizer stripped the
 * attribute on every save, so a manager could reword or delete any statutory clause.
 */
describe("verbatim disclosure clauses survive a manager edit", () => {
  const VERBATIM = "Housing built before 1978 may contain lead-based paint.";
  const base = `<html><body><h2>Disclosures</h2><p data-disclosure-rule="fed-lead-paint">${VERBATIM}</p><p>Manager notes.</p></body></html>`;

  it("keeps the attribute through a save instead of stripping it", () => {
    const cleaned = sanitizeLeaseDocumentHtml(base) ?? "";
    expect(cleaned).toContain('data-disclosure-rule="fed-lead-paint"');
  });

  it("restores the statutory text when a manager rewords it", () => {
    const reworded = base.replace(VERBATIM, "Lead paint is probably fine, do not worry about it.");
    const result = sanitizeManagerLeaseDocumentEdit(base, reworded);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.html).toContain(VERBATIM);
      expect(result.html).not.toContain("do not worry about it");
    }
  });

  it("refuses a save that deletes the clause outright", () => {
    const deleted = `<html><body><h2>Disclosures</h2><p>Manager notes.</p></body></html>`;
    const result = sanitizeManagerLeaseDocumentEdit(base, deleted);
    expect(result.ok).toBe(false);
  });

  it("still allows editing the surrounding text", () => {
    const edited = base.replace("Manager notes.", "Quiet hours are 10pm to 8am.");
    const result = sanitizeManagerLeaseDocumentEdit(base, edited);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.html).toContain("Quiet hours are 10pm to 8am.");
      expect(result.html).toContain(VERBATIM);
    }
  });
});

/**
 * The manager-template lease embeds the manager's own PDF through the authorizing route. The
 * sanitizer was deleting it: the preview lost the document, the stored body lost the URL the
 * lease-template access check relies on, and every legacy signed template row 409'd on any
 * write because the sanitized body no longer equalled the raw stored one.
 */
describe("manager template embed survives sanitization", () => {
  const URL = "/api/portal/lease-template?path=mgr-1%2Flease.pdf";
  const doc = `<html><body><a class="doc-link" href="${URL}" target="_blank" rel="noopener">Open lease document: lease.pdf</a><object class="doc-embed" data="${URL}" type="application/pdf"><p>fallback</p></object></body></html>`;

  it("keeps the route-anchored link and embed", () => {
    const cleaned = sanitizeLeaseDocumentHtml(doc) ?? "";
    expect(cleaned).toContain(`href="${URL}"`);
    expect(cleaned).toContain(`data="${URL}"`);
    // and stays balanced
    expect((cleaned.match(/<a\b/g) ?? []).length).toBe((cleaned.match(/<\/a>/g) ?? []).length);
    expect((cleaned.match(/<object\b/g) ?? []).length).toBe((cleaned.match(/<\/object>/g) ?? []).length);
  });

  it("rejects any URL that is not that route, including a lookalike", () => {
    for (const bad of [
      "https://evil.example/steal.pdf",
      "https://evil.example/?x=/api/portal/lease-template?path=a",
      "javascript:alert(1)",
      "data:application/pdf;base64,AAAA",
    ]) {
      const cleaned = sanitizeLeaseDocumentHtml(`<html><body><a href="${bad}">x</a></body></html>`) ?? "";
      expect(cleaned).not.toContain(bad);
      expect(cleaned).not.toMatch(/<a\b/);
    }
  });

  it("drops an anchor with no usable URL rather than leaving a shell", () => {
    const cleaned = sanitizeLeaseDocumentHtml("<html><body><p>x</p><a>bad</a></body></html>") ?? "";
    expect(cleaned).not.toMatch(/<\/?a\b/);
  });
});
