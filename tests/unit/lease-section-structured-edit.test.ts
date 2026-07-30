import { describe, expect, it } from "vitest";
import {
  applyLeaseSectionEditablePartEdits,
  parseLeaseSectionEditableParts,
  rebuildBodyHtmlFromParts,
} from "@/lib/lease-section-structured-edit";
import { injectLeasePreviewSectionMarkers, injectLeaseVisualEditDocument, parseLeaseHtmlSections } from "@/lib/lease-html-sections";

describe("lease-section-structured-edit", () => {
  const body = `
<table>
<tr><th>Resident</th><td>Jamie Rivera</td></tr>
<tr><th>Premises</th><td>Room 2</td></tr>
</table>
<p>Quiet hours apply nightly.</p>
<ul><li>No smoking indoors.</li></ul>`;

  it("parses table rows, paragraphs, and list items", () => {
    const parts = parseLeaseSectionEditableParts(body);
    expect(parts.some((part) => part.kind === "table-row")).toBe(true);
    expect(parts.some((part) => part.kind === "paragraph")).toBe(true);
    expect(parts.some((part) => part.kind === "list-item")).toBe(true);
  });

  it("rebuilds html after field edits", () => {
    const parts = parseLeaseSectionEditableParts(body);
    const resident = parts.find((part) => part.kind === "table-row" && part.label === "Resident");
    expect(resident).toBeTruthy();
    const edited = parts.map((part) =>
      part.id === resident!.id && part.kind === "table-row" ? { ...part, value: "Alex Kim" } : part,
    );
    const next = rebuildBodyHtmlFromParts(edited);
    expect(next).toContain("Alex Kim");
    expect(next).toContain("Quiet hours apply nightly.");
    expect(applyLeaseSectionEditablePartEdits(body, edited)).toContain("Alex Kim");
  });
});

describe("injectLeasePreviewSectionMarkers", () => {
  it("wraps parsed sections with data-lease-section-id markers", () => {
    const html = `<!DOCTYPE html><html><body><h1>Lease</h1><h2>1. Parties</h2><p>A</p><h2>2. Rent</h2><p>B</p></body></html>`;
    const marked = injectLeasePreviewSectionMarkers(html);
    const sections = parseLeaseHtmlSections(html);
    for (const section of sections) {
      expect(marked).toContain(`data-lease-section-id="${section.id}"`);
    }
    expect(marked).toContain("lease-preview-section-dblclick");
  });
});

describe("injectLeaseVisualEditDocument", () => {
  it("wraps sections and posts focus on double-click", () => {
    const html = `<!DOCTYPE html><html><body><h2>1. Parties</h2><p>A</p></body></html>`;
    const marked = injectLeaseVisualEditDocument(html);
    expect(marked).toContain("lease-visual-section-focus");
    expect(marked).toContain('data-lease-section-id="1-parties"');
  });
});
