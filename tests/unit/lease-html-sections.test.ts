import { describe, expect, it } from "vitest";
import {
  applyLeaseSectionBodyEdits,
  parseLeaseHtmlSections,
  rebuildLeaseHtmlFromSections,
  scopeLeaseDocumentStyles,
} from "@/lib/lease-html-sections";

const SAMPLE = `<!DOCTYPE html><html><body>
<h2>1. Parties</h2><p>Party A</p>
<h2>26. Electronic Signature</h2><p>Sign in portal.</p>
<div class="addendum"><h2>Addendum A — Move-In Condition</h2><p>Checklist</p></div>
<div class="addendum"><h2>Addendum E — House Rules Enforcement</h2><p>Quiet hours</p></div>
</body></html>`;

describe("lease-html-sections", () => {
  it("parses numbered sections and addenda headings", () => {
    const sections = parseLeaseHtmlSections(SAMPLE);
    expect(sections.length).toBeGreaterThanOrEqual(4);
    expect(sections.some((s) => s.title === "1. Parties")).toBe(true);
    expect(sections.some((s) => s.title === "26. Electronic Signature")).toBe(true);
    expect(sections.some((s) => s.title.includes("Addendum A"))).toBe(true);
    expect(sections.some((s) => s.title.includes("Addendum E"))).toBe(true);
  });

  it("rebuilds html after a section body edit", () => {
    const sections = parseLeaseHtmlSections(SAMPLE);
    const signature = sections.find((s) => s.title.includes("Electronic Signature"));
    expect(signature).toBeTruthy();
    const edited = applyLeaseSectionBodyEdits(SAMPLE, {
      [signature!.id]: "<p>Updated signature language.</p>",
    });
    expect(edited).toContain("Updated signature language.");
    expect(edited).toContain("26. Electronic Signature");
    expect(edited).toContain("Party A");
  });

  it("preserves document head before first section", () => {
    const sections = parseLeaseHtmlSections(SAMPLE);
    const rebuilt = rebuildLeaseHtmlFromSections(
      SAMPLE,
      sections.map((section) => ({
        id: section.id,
        headingHtml: section.headingHtml,
        bodyHtml: section.id === "lease-document-header" ? section.bodyHtml : "<p>x</p>",
      })),
    );
    expect(rebuilt.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(rebuilt).toContain("<p>x</p>");
  });

  it("scopes body rules under an editor wrapper selector", () => {
    const scoped = scopeLeaseDocumentStyles("body { background: #fff; color: #111; }", ".lease-doc");
    expect(scoped).toContain(".lease-doc {");
    expect(scoped).not.toMatch(/\bbody\s*\{/);
  });
});
