import { describe, expect, it } from "vitest";
import { dedupeLeasePipelineRows, type LeasePipelineRow } from "@/lib/lease-pipeline-storage";

function makeRow(overrides: Partial<LeasePipelineRow> & Pick<LeasePipelineRow, "id" | "bucket">): LeasePipelineRow {
  return {
    residentName: "Resident",
    residentEmail: "resident@example.com",
    unit: "Unit A",
    stageLabel: "—",
    updated: "Jun 1",
    pdfVersion: 1,
    notes: "",
    updatedAtIso: "2026-06-01T00:00:00.000Z",
    thread: [],
    ...overrides,
  };
}

describe("dedupeLeasePipelineRows", () => {
  it("keeps the more advanced workflow row when duplicates share an axis id", () => {
    const managerRow = makeRow({
      id: "lease_dup_manager",
      axisId: "AXIS-TEST",
      bucket: "manager",
      status: "Manager Review",
      updatedAtIso: "2026-06-26T10:00:00.000Z",
      generatedHtml: "<p>lease</p>",
    });
    const residentRow = makeRow({
      id: "lease_dup_resident",
      axisId: "AXIS-TEST",
      bucket: "resident",
      status: "Resident Signature Pending",
      updatedAtIso: "2026-06-20T10:00:00.000Z",
      sentToResidentAt: "2026-06-20T10:00:00.000Z",
      generatedHtml: "<p>lease</p>",
    });

    const deduped = dedupeLeasePipelineRows([managerRow, residentRow]);
    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.bucket).toBe("resident");
    expect(deduped[0]?.id).toBe("lease_dup_resident");
  });
});
