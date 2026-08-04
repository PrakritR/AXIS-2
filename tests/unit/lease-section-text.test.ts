// @vitest-environment jsdom
//
// Manager-authored section content. The property under test is not "the sanitizer catches X"
// but "X cannot be expressed": the value is escaped before any transform runs, and every tag
// in the output is emitted by our own code. These assert against a real HTML parser, because
// the question is what a resident's BROWSER does with the result.
import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import {
  editableLeaseSections,
  isEditableLeaseSection,
  renderLeaseSectionEdit,
  renderSectionRich,
  renderSectionText,
  sectionSourceFromHtml,
} from "@/lib/lease-section-text";

function parsed(html: string) {
  return new JSDOM(`<body>${html}</body>`).window.document.body;
}

function liveHandlers(html: string): string[] {
  const found: string[] = [];
  for (const el of Array.from(parsed(html).querySelectorAll("*"))) {
    for (const attr of Array.from(el.attributes)) {
      if (attr.name.toLowerCase().startsWith("on")) found.push(`${el.tagName}[${attr.name}]`);
    }
  }
  return found;
}

/** Every payload that defeated the allowlist sanitizer across four review rounds. */
const PAYLOADS = [
  '<script>alert(1)</script>',
  '<img src=x onerror="alert(1)">',
  '<div onclick="alert(1)">x</div>',
  '<style>p[data-disclosure-rule]{display:none}</style>',
  '<div style="display:none">hidden clause</div>',
  '<style>unclosed truncation',
  '<!--><style onload="alert(1)">p{}</style> -->',
  '<!---><div onmouseover="alert(1)">x</div> -->',
  '<!-- --!><div onclick="alert(1)">x</div> -->',
  '<p data-disclosure-rule = "fed-lead-paint">decoy</p>',
  '<a href="https://evil.example/steal">link</a>',
  '<object data="https://evil.example/x.pdf"></object>',
];

describe("manager section content cannot express markup", () => {
  it.each(PAYLOADS)("text mode renders %s as visible characters", (payload) => {
    const html = renderSectionText(payload);
    expect(liveHandlers(html)).toEqual([]);
    // Only our own paragraph tags survive.
    expect(parsed(html).querySelectorAll("script, style, img, object, a, div").length).toBe(0);
    // And the manager sees what they typed.
    expect(parsed(html).textContent).toContain(payload.slice(0, 12));
  });

  it.each(PAYLOADS)("rich mode renders %s as visible characters too", (payload) => {
    const html = renderSectionRich(payload);
    expect(liveHandlers(html)).toEqual([]);
    expect(parsed(html).querySelectorAll("script, style, img, object, a, div").length).toBe(0);
  });

  it("emits no attributes at all, so display:none and class hooks are unreachable", () => {
    const html = renderSectionRich("**Quiet hours** are 10pm.\n\n- No smoking\n- No pets\n\n### House rules\n\n---");
    for (const el of Array.from(parsed(html).querySelectorAll("*"))) {
      expect(Array.from(el.attributes).map((a) => a.name)).toEqual([]);
    }
  });
});

describe("text mode", () => {
  it("makes a paragraph per blank line and a break per newline", () => {
    const html = renderSectionText("First line\nsecond line\n\nNew paragraph");
    const doc = parsed(html);
    expect(doc.querySelectorAll("p").length).toBe(2);
    expect(doc.querySelectorAll("br").length).toBe(1);
  });

  it("returns empty for blank input rather than an empty paragraph", () => {
    expect(renderSectionText("   \n\n  ")).toBe("");
  });
});

describe("rich mode", () => {
  it("supports the small set a lease actually needs", () => {
    const doc = parsed(
      renderSectionRich("### Rules\n\n**Bold** and *italic*.\n\n- one\n- two\n\n1. first\n2. second\n\n---"),
    );
    expect(doc.querySelector("h3")?.textContent).toBe("Rules");
    expect(doc.querySelector("strong")?.textContent).toBe("Bold");
    expect(doc.querySelector("em")?.textContent).toBe("italic");
    expect(doc.querySelectorAll("ul li").length).toBe(2);
    expect(doc.querySelectorAll("ol li").length).toBe(2);
    expect(doc.querySelectorAll("hr").length).toBe(1);
  });

  it("closes a list before a following paragraph", () => {
    const doc = parsed(renderSectionRich("- one\n- two\n\nAfter the list."));
    expect(doc.querySelectorAll("ul").length).toBe(1);
    expect(doc.querySelectorAll("ul li").length).toBe(2);
    expect(doc.querySelector("p")?.textContent).toBe("After the list.");
  });

  it("keeps an ampersand readable rather than double-escaping it", () => {
    expect(parsed(renderSectionRich("Rent & utilities")).textContent).toBe("Rent & utilities");
  });
});

describe("format dispatch and seeding", () => {
  it("renders by the stored format", () => {
    expect(renderLeaseSectionEdit({ format: "text", value: "- not a list" })).toContain("- not a list");
    expect(renderLeaseSectionEdit({ format: "rich", value: "- a list" })).toContain("<li>");
  });

  it("seeds an editor from existing section HTML", () => {
    const seeded = sectionSourceFromHtml("<p>First para.</p><ul><li>One</li><li>Two</li></ul><p>Last.</p>");
    expect(seeded).toContain("First para.");
    expect(seeded).toContain("- One");
    expect(seeded).toContain("- Two");
    // Round trips back into a list.
    expect(parsed(renderSectionRich(seeded)).querySelectorAll("li").length).toBe(2);
  });
});

describe("which sections may be edited at all", () => {
  const section = (over: Partial<{ id: string; title: string; bodyHtml: string }>) => ({
    id: "s",
    title: "House Rules",
    bodyHtml: "<p>text</p>",
    ...over,
  });

  it("never offers a section carrying an engine-inserted disclosure", () => {
    expect(
      isEditableLeaseSection(
        section({ title: "Lead-Based Paint Disclosure", bodyHtml: '<p data-disclosure-rule="fed-lead-paint">x</p>' }),
      ),
    ).toBe(false);
  });

  it("never offers a ledger-derived section, which would break document-equals-ledger", () => {
    for (const title of ["Rent & Fees Schedule (Exhibit A)", "Application Summary (Incorporated by Reference)"]) {
      expect(isEditableLeaseSection(section({ title }))).toBe(false);
    }
  });

  it("never offers the signature block", () => {
    expect(isEditableLeaseSection(section({ title: "Electronic Signature" }))).toBe(false);
  });

  it("offers ordinary prose sections", () => {
    expect(isEditableLeaseSection(section({ title: "House Rules" }))).toBe(true);
    expect(editableLeaseSections([section({ title: "House Rules" }), section({ title: "Exhibit A" })]).length).toBe(1);
  });
});
