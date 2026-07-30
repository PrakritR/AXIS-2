import { describe, expect, it } from "vitest";
import {
  applyLeaseSectionBodyEdits,
  parseLeaseHtmlSections,
  rebuildLeaseHtmlFromSections,
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
    expect(sections).toHaveLength(4);
    expect(sections[0]?.title).toBe("1. Parties");
    expect(sections[1]?.title).toBe("26. Electronic Signature");
    expect(sections[2]?.title).toContain("Addendum A");
    expect(sections[3]?.title).toContain("Addendum E");
  });

  it("rebuilds html after a section body edit", () => {
    const sections = parseLeaseHtmlSections(SAMPLE);
    const edited = applyLeaseSectionBodyEdits(SAMPLE, {
      [sections[1]!.id]: "<p>Updated signature language.</p>",
    });
    expect(edited).toContain("Updated signature language.");
    expect(edited).toContain("26. Electronic Signature");
    expect(edited).toContain("Party A");
  });

  it("preserves document head before first section", () => {
    const sections = parseLeaseHtmlSections(SAMPLE);
    const rebuilt = rebuildLeaseHtmlFromSections(
      SAMPLE,
      sections.map((section) => ({ headingHtml: section.headingHtml, bodyHtml: "<p>x</p>" })),
    );
    expect(rebuilt.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(rebuilt).toContain("<p>x</p>");
  });
});
