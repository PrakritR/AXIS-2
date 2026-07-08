import { describe, expect, it } from "vitest";
import { htmlToBlocks } from "@/lib/reports/export/document-pdf";

describe("htmlToBlocks", () => {
  it("splits headings, paragraphs, and list items in document order", () => {
    const html = `
      <h1>Lease Agreement</h1>
      <p>This lease is between the parties below.</p>
      <h2>Terms</h2>
      <ul><li>Rent is due on the 1st.</li><li>No pets.</li></ul>
    `;
    const blocks = htmlToBlocks(html);
    expect(blocks).toEqual([
      { kind: "heading", text: "Lease Agreement" },
      { kind: "paragraph", text: "This lease is between the parties below." },
      { kind: "subheading", text: "Terms" },
      { kind: "listItem", text: "Rent is due on the 1st." },
      { kind: "listItem", text: "No pets." },
    ]);
  });

  it("decodes HTML entities and strips inline tags", () => {
    const blocks = htmlToBlocks("<p>Tenant &amp; landlord agree to <strong>all</strong> terms &mdash; fully.</p>");
    expect(blocks).toEqual([{ kind: "paragraph", text: "Tenant & landlord agree to all terms — fully." }]);
  });

  it("treats <br> and block closes as paragraph breaks and collapses whitespace", () => {
    const blocks = htmlToBlocks("First line<br>Second   line");
    expect(blocks).toEqual([
      { kind: "paragraph", text: "First line" },
      { kind: "paragraph", text: "Second line" },
    ]);
  });

  it("falls back to plain-text paragraphs when there are no block tags", () => {
    const blocks = htmlToBlocks("Just some plain text with no markup.");
    expect(blocks).toEqual([{ kind: "paragraph", text: "Just some plain text with no markup." }]);
  });

  it("ignores empty tags", () => {
    const blocks = htmlToBlocks("<h1></h1><p>Real content.</p><p>  </p>");
    expect(blocks).toEqual([{ kind: "paragraph", text: "Real content." }]);
  });
});
