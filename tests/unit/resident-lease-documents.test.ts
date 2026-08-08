import { describe, expect, it } from "vitest";
import {
  buildResidentLeaseDocumentRows,
  decodeLeaseDocumentDetailId,
  encodeLeaseDocumentDetailId,
  filterResidentLeaseDocumentRows,
  residentLeaseStatusFilterTabs,
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
    expect(rows[0]?.status).toBe("Signed");
    expect(rows[0]?.filterBucket).toBe("signed");
    expect(rows[1]?.status).toBe("Signed");
    expect(rows[1]?.filterBucket).toBe("signed");
  });

  it("marks in-progress renewal rows as pending", () => {
    const row = baseLeaseRow({
      managerSignature: null,
      residentSignature: null,
      status: "Manager Review",
      bucket: "manager",
      pendingRenewal: {
        leaseTerm: "12-Month",
        leaseStart: "2027-01-01",
        leaseEnd: "2027-12-31",
        monthlyRent: null,
        requestedAtIso: "2026-08-01T00:00:00.000Z",
      },
      signedLeaseSnapshots: [
        {
          id: "snap-1",
          label: "Prior lease · 12-Month",
          fullySignedAt: "2026-01-02T00:00:00.000Z",
          generatedHtml: "<html><body>Old</body></html>",
          archivedAtIso: "2026-08-01T00:00:00.000Z",
        },
      ],
    });
    const rows = buildResidentLeaseDocumentRows(row);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.filterBucket).toBe("pending");
    expect(rows[0]?.status).toBe("Pending");
    expect(rows[1]?.filterBucket).toBe("signed");
  });

  it("filters pending and signed rows", () => {
    const row = baseLeaseRow({
      managerSignature: null,
      residentSignature: null,
      status: "Resident Signature Pending",
      bucket: "resident",
      signedLeaseSnapshots: [
        {
          id: "snap-1",
          label: "Prior lease",
          fullySignedAt: "2026-01-02T00:00:00.000Z",
          generatedHtml: "<html><body>Old</body></html>",
          archivedAtIso: "2026-08-01T00:00:00.000Z",
        },
      ],
    });
    const rows = buildResidentLeaseDocumentRows(row);
    const tabs = residentLeaseStatusFilterTabs(rows);
    expect(tabs.find((tab) => tab.id === "pending")?.count).toBe(1);
    expect(tabs.find((tab) => tab.id === "signed")?.count).toBe(1);
    expect(filterResidentLeaseDocumentRows(rows, "pending")).toHaveLength(1);
    expect(filterResidentLeaseDocumentRows(rows, "signed")).toHaveLength(1);
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
