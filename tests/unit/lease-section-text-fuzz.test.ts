// @vitest-environment jsdom
//
// Adversarial pass on the escape-then-transform ordering. renderSectionRich escapes the
// manager's input FIRST and then applies markdown transforms to the escaped string, so the
// only `<` in the output should be ones this module wrote. This fuzzes that claim: if any
// input produces an element or attribute the module cannot emit, the ordering is broken.
import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { renderSectionRich, renderSectionText } from "@/lib/lease-section-text";

const EMITTED = new Set(["P", "BR", "STRONG", "EM", "UL", "OL", "LI", "H3", "H4", "HR"]);

/**
 * String-level scan, so the bulk fuzz does not build a DOM per input. Every `<` in the output
 * must open or close one of the tags this module writes, with NO attributes. Anything else,
 * including a stray bare `<`, is a hole in the escape-then-transform ordering.
 */
const EMITTED_TAG = /^<\/?(?:p|br|strong|em|ul|ol|li|h3|h4|hr)\s*\/?>$/;

function inspect(html: string) {
  const badTags: string[] = [];
  const anyAttrs: string[] = [];
  for (const token of html.match(/<[^>]*>?/g) ?? []) {
    if (!EMITTED_TAG.test(token)) badTags.push(token);
    if (/\s[A-Za-z-]+\s*=/.test(token)) anyAttrs.push(token);
  }
  return { badTags, anyAttrs };
}

const PIECES = [
  "<", ">", "&", '"', "'", "/", "\\", "!", "-", "*", "**", "#", "###", "`", "\n", "\n\n",
  "script", "img", "style", "onerror=", "javascript:", "&lt;", "&gt;", "&amp;", "&#60;",
  "&amp;lt;", "<!--", "-->", "--!>", "<!-->", "]]>", "<![CDATA[", "<p", "</p>", "data-x=",
];

function combos(depth: number): string[] {
  let acc = [""];
  for (let i = 0; i < depth; i++) {
    const next: string[] = [];
    for (const a of acc) for (const p of PIECES) next.push(a + p);
    acc = next;
  }
  return acc;
}

describe("rich mode cannot emit a tag or attribute it did not write", () => {
  it("survives every 2-piece combination of dangerous fragments", () => {
    const offenders: string[] = [];
    for (const input of combos(2)) {
      const { badTags, anyAttrs } = inspect(renderSectionRich(input));
      if (badTags.length || anyAttrs.length) offenders.push(`${JSON.stringify(input)} -> ${badTags.join()} ${anyAttrs.join()}`);
    }
    expect(offenders.slice(0, 8)).toEqual([]);
  });

  it("survives markdown markers wrapped around markup fragments", () => {
    const offenders: string[] = [];
    for (const frag of PIECES) {
      for (const shape of [
        `**${frag}**`, `*${frag}*`, `### ${frag}`, `- ${frag}`, `1. ${frag}`,
        `**${frag}`, `${frag}**`, `***${frag}***`, `- ${frag}\n- ${frag}`, `${frag}\n---\n${frag}`,
      ]) {
        const { badTags, anyAttrs } = inspect(renderSectionRich(shape));
        if (badTags.length || anyAttrs.length) offenders.push(`${JSON.stringify(shape)} -> ${badTags.join()} ${anyAttrs.join()}`);
      }
    }
    expect(offenders.slice(0, 8)).toEqual([]);
  });

  it("text mode emits only paragraphs and breaks, whatever it is given", () => {
    const offenders: string[] = [];
    for (const input of combos(2)) {
      const { badTags, anyAttrs } = inspect(renderSectionText(input));
      const disallowed = badTags.filter((t) => t !== "P" && t !== "BR");
      if (disallowed.length || anyAttrs.length) offenders.push(JSON.stringify(input));
    }
    expect(offenders.slice(0, 8)).toEqual([]);
  });

  it("never lets an entity round-trip back into a live tag", () => {
    for (const input of ["&lt;script&gt;alert(1)&lt;/script&gt;", "&amp;lt;img src=x onerror=alert(1)&amp;gt;", "&#60;script&#62;"]) {
      const html = renderSectionRich(input);
      expect(inspect(html).badTags).toEqual([]);
      expect(new JSDOM(`<body>${html}</body>`).window.document.querySelector("script")).toBeNull();
    }
  });
});

/**
 * `row_data` is browser-writable, so a stored override is DATA, not permission. A crafted row
 * can name any section id, including a statutory disclosure. The render path must re-check
 * editability every time rather than trusting what the UI would have allowed.
 */
describe("a stored override cannot reach a non-editable section", () => {
  it("is ignored at render for a disclosure, a ledger-derived section and the signature block", async () => {
    const { parseLeaseHtmlSections, rebuildLeaseHtmlFromSections } = await import("@/lib/lease-html-sections");
    const { isEditableLeaseSection, renderLeaseSectionEdit } = await import("@/lib/lease-section-text");

    const doc = [
      "<html><body>",
      '<h2>1. House Rules</h2><p>Quiet hours apply.</p>',
      '<h2>2. Lead-Based Paint Disclosure</h2><p data-disclosure-rule="fed-lead-paint">FEDERAL LEAD WARNING STATEMENT.</p>',
      "<h2>3. Rent &amp; Fees Schedule (Exhibit A)</h2><table><tr><td>Rent</td><td>$825.00</td></tr></table>",
      "<h2>4. Electronic Signature</h2><p>Typed name binds.</p>",
      "</body></html>",
    ].join("");

    const sections = parseLeaseHtmlSections(doc);
    expect(sections.length).toBeGreaterThan(3);

    // The attacker's row overrides every section, editable or not.
    const hostile = Object.fromEntries(
      sections.map((s) => [s.id, { format: "text" as const, value: "OVERRIDDEN BY A CRAFTED ROW" }]),
    );

    // Exactly the render rule the storage layer applies.
    const rendered = rebuildLeaseHtmlFromSections(
      doc,
      sections.map((section) => {
        const edit = hostile[section.id];
        if (!edit || !isEditableLeaseSection(section)) return section;
        return { ...section, bodyHtml: renderLeaseSectionEdit(edit) };
      }),
    );

    // The statutory clause, the ledger figures and the signature block all survive intact.
    expect(rendered).toContain("FEDERAL LEAD WARNING STATEMENT");
    expect(rendered).toContain('data-disclosure-rule="fed-lead-paint"');
    expect(rendered).toContain("$825.00");
    expect(rendered).toContain("Typed name binds.");
    // Only the ordinary prose section took the override.
    expect(rendered.match(/OVERRIDDEN BY A CRAFTED ROW/g)?.length ?? 0).toBe(1);
  });
});
