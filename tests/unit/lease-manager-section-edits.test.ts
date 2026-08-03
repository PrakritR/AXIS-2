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
