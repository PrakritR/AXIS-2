import { describe, expect, it } from "vitest";
import {
  buildResidentLeaseDocumentRows,
  decodeLeaseDocumentDetailId,
  encodeLeaseDocumentDetailId,
  resolveResidentLeaseDocumentView,
} from "@/lib/resident-lease-documents";
import type { LeasePipelineRow } from "@/lib/lease-pipeline-storage";

function baseLeaseRow(overrides: Partial<LeasePipelineRow> = {}): LeasePipelineRow {
  return {
    id: "lease-1",
    residentName: "Alex Resident",
    residentEmail: "alex@example.com",
    unit: "2B",
    stageLabel: "Signed",
    updated: "just now",
    bucket: "signed",
    pdfVersion: 1,
    notes: "",
    updatedAtIso: "2026-01-01T00:00:00.000Z",
    thread: [],
    managerSignature: { name: "Manager", signedAtIso: "2026-01-01T00:00:00.000Z" },
    residentSignature: { name: "Alex", signedAtIso: "2026-01-02T00:00:00.000Z" },
    status: "Fully Signed",
    fullySignedAt: "2026-01-02T00:00:00.000Z",
    generatedHtml: "<html><body>Lease</body></html>",
    application: { leaseTerm: "12-Month", leaseStart: "2026-01-01", leaseEnd: "2026-12-31" },
    ...overrides,
  };
}

describe("resident lease documents", () => {
  it("lists current and archived leases", () => {
    const row = baseLeaseRow({
      signedLeaseSnapshots: [
        {
          id: "snap-1",
          label: "Prior lease · 12-Month",
          fullySignedAt: "2025-12-01T00:00:00.000Z",
          generatedHtml: "<html><body>Old</body></html>",
          archivedAtIso: "2026-01-02T00:00:00.000Z",
        },
      ],
    });
    const rows = buildResidentLeaseDocumentRows(row);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.status).toBe("Fully signed");
    expect(rows[1]?.status).toBe("Prior lease");
  });

  it("encodes and resolves snapshot detail ids", () => {
    const detailId = encodeLeaseDocumentDetailId("lease-1", "snap-1");
    expect(decodeLeaseDocumentDetailId(detailId)).toEqual({ leaseRowId: "lease-1", snapshotId: "snap-1" });
    const row = baseLeaseRow({
      signedLeaseSnapshots: [
        {
          id: "snap-1",
          label: "Prior lease",
          fullySignedAt: "2025-12-01T00:00:00.000Z",
          generatedHtml: "<html><body>Old</body></html>",
          archivedAtIso: "2026-01-02T00:00:00.000Z",
        },
      ],
    });
    const view = resolveResidentLeaseDocumentView(row, detailId);
    expect(view?.title).toBe("Prior lease");
    expect(view?.leaseHtml).toContain("Old");
  });
});
