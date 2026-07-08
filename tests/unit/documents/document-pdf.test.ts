import { describe, expect, it } from "vitest";
import { htmlToBlocks } from "@/lib/reports/export/document-pdf";

describe("document-pdf htmlToBlocks", () => {
  it("extracts headings and paragraphs", () => {
    const blocks = htmlToBlocks("<h1>Lease</h1><p>Tenant agrees to pay rent.</p><li>Rule one</li>");
    expect(blocks.map((b) => b.kind)).toContain("heading");
    expect(blocks.some((b) => b.kind === "listItem")).toBe(true);
    expect(blocks[0]?.text).toBe("Lease");
  });

  it("falls back to plain text chunks", () => {
    const blocks = htmlToBlocks("Line one\n\nLine two");
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks[0]?.text).toContain("Line one");
  });
});
