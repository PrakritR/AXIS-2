// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getLeaseDocumentHtml,
  materializeManagerSectionEditsForSignature,
  normalizeLeasePipelineRow,
  readLeasePipeline,
  seedDemoLeasePipeline,
  updateLeasePipelineRow,
  type LeasePipelineRow,
} from "@/lib/lease-pipeline-storage";
import { leaseDocumentSha256 } from "@/lib/lease-execution-evidence";

const MANAGER_ID = "manager-section-edits";
const BASE_HTML = `<!doctype html><html><body>
  <h2>Rent</h2><p>Rent is due on the first.</p>
  <h2>Required disclosure</h2><p data-disclosure-rule="lead-paint">Required legal language.</p>
</body></html>`;

function row(overrides: Partial<LeasePipelineRow> = {}): LeasePipelineRow {
  return normalizeLeasePipelineRow({
    id: "lease-section-edits",
    residentName: "Jordan Lee",
    residentEmail: "jordan@example.com",
    unit: "Unit 2",
    bucket: "manager",
    pdfVersion: 1,
    notes: "",
    updatedAtIso: "2026-08-03T00:00:00.000Z",
    managerUserId: MANAGER_ID,
    thread: [],
    generatedHtml: BASE_HTML,
    managerSectionEdits: {
      rent: { format: "text", value: "Rent is due on the fifth." },
    },
    ...overrides,
  });
}

describe("manager lease section edits", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
  });

  it("keeps a section edit when the generated base lease is regenerated", () => {
    seedDemoLeasePipeline([row()], MANAGER_ID);
    const regenerated = BASE_HTML.replace("Rent is due on the first.", "Rent is due on the tenth.");

    expect(updateLeasePipelineRow("lease-section-edits", { generatedHtml: regenerated }, MANAGER_ID)).toBe(true);
    const updated = readLeasePipeline(MANAGER_ID)[0]!;

    expect(updated.managerSectionEdits).toEqual({ rent: { format: "text", value: "Rent is due on the fifth." } });
    expect(getLeaseDocumentHtml(updated)).toContain("Rent is due on the fifth.");
    expect(getLeaseDocumentHtml(updated)).not.toContain("Rent is due on the tenth.");
  });

  it("ignores a stored edit for a disclosure section when rendering", () => {
    const withDisclosureEdit = row({
      managerSectionEdits: {
        rent: { format: "text", value: "Rent is due on the fifth." },
        "required-disclosure": { format: "rich", value: "**Replacement disclosure**" },
      },
    });

    const html = getLeaseDocumentHtml(withDisclosureEdit)!;

    expect(html).toContain("Required legal language.");
    expect(html).not.toContain("Replacement disclosure");
  });

  it("materializes the rendered section body before signing so its hash is stable", async () => {
    const materialized = materializeManagerSectionEditsForSignature(row());
    const beforeHash = await leaseDocumentSha256(materialized);

    expect(materialized.generatedHtml).toContain("Rent is due on the fifth.");
    expect(materialized.managerSectionEdits).toBeNull();
    expect(await leaseDocumentSha256(materialized)).toBe(beforeHash);
  });
});

/**
 * A manager may write a section as prose OR as HTML. Both are offered, so exactly one has to
 * be authoritative per section, and the tiebreaker must not be a rule someone has to remember:
 * an HTML save is BASED ON the rendered document and clears the typed overrides, so the prose
 * is baked into the bytes being saved rather than left to win over them afterwards.
 */
describe("text and HTML edits of the same lease", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
  });

  it("shows the editor the rendered body, not the stale stored one", async () => {
    const { readLeaseSectionsForEdit } = await import("@/lib/lease-section-edit.client");
    seedDemoLeasePipeline([row()], MANAGER_ID);

    const sections = readLeaseSectionsForEdit(readLeasePipeline(MANAGER_ID)[0]!);
    const rent = sections.find((section) => section.id === "rent")!;

    // The prose edit, not `BASE_HTML`'s original wording.
    expect(rent.bodyHtml).toContain("Rent is due on the fifth.");
    expect(rent.bodyHtml).not.toContain("Rent is due on the first.");
  });

  it("bakes a prose edit into the document when a section is saved as HTML", async () => {
    const { saveLeaseSectionBodyEdits } = await import("@/lib/lease-section-edit.client");
    seedDemoLeasePipeline([row()], MANAGER_ID);

    const saved = saveLeaseSectionBodyEdits(
      "lease-section-edits",
      { rent: "<p>Rent is due on the twentieth.</p>" },
      MANAGER_ID,
    );

    expect(saved.ok).toBe(true);
    const updated = readLeasePipeline(MANAGER_ID)[0]!;
    // The override is gone, so it can never re-apply over the HTML just written.
    expect(updated.managerSectionEdits).toBeNull();
    const html = getLeaseDocumentHtml(updated)!;
    expect(html).toContain("Rent is due on the twentieth.");
    expect(html).not.toContain("Rent is due on the fifth.");
  });

  it("keeps another section's prose edit when one section is saved as HTML", async () => {
    const { saveLeaseSectionBodyEdits } = await import("@/lib/lease-section-edit.client");
    const twoSections = row({
      generatedHtml: `<!doctype html><html><body>
  <h2>Rent</h2><p>Rent is due on the first.</p>
  <h2>House rules</h2><p>Original rules.</p>
</body></html>`,
      managerSectionEdits: {
        rent: { format: "text", value: "Rent is due on the fifth." },
        "house-rules": { format: "text", value: "Quiet hours start at 10pm." },
      },
    });
    seedDemoLeasePipeline([twoSections], MANAGER_ID);

    saveLeaseSectionBodyEdits("lease-section-edits", { rent: "<p>Rent is due on the twentieth.</p>" }, MANAGER_ID);

    const html = getLeaseDocumentHtml(readLeasePipeline(MANAGER_ID)[0]!)!;
    expect(html).toContain("Rent is due on the twentieth.");
    // Baked in by the save rather than dropped with the overrides map.
    expect(html).toContain("Quiet hours start at 10pm.");
  });

  it("refuses a prose edit to a disclosure section at the save path, not just at render", async () => {
    const { saveLeaseSectionEdits } = await import("@/lib/lease-section-edit.client");
    seedDemoLeasePipeline([row()], MANAGER_ID);

    const saved = saveLeaseSectionEdits(
      "lease-section-edits",
      { "required-disclosure": { format: "text", value: "Rewritten disclosure." } },
      MANAGER_ID,
    );

    expect(saved.ok).toBe(false);
    expect(getLeaseDocumentHtml(readLeasePipeline(MANAGER_ID)[0]!)).toContain("Required legal language.");
  });
});
