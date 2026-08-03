// @vitest-environment jsdom
/**
 * A lease row that carries a signature IS the evidence of what was signed.
 * These tests fail if any future change lets a signed row's document body be
 * replaced. Remove the `preserveSignedLeaseDocuments` call from `write` and
 * the first test goes red.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  preserveSignedLeaseDocuments,
  readLeasePipeline,
  generateLeaseHtmlForRow,
  seedDemoLeasePipeline,
  updateLeasePipelineRow,
  type LeasePipelineRow,
} from "@/lib/lease-pipeline-storage";
import { saveLeaseDocumentHtml } from "@/lib/lease-section-edit.client";

const MANAGER_ID = "manager-evidence-test";

function signedRow(overrides: Partial<LeasePipelineRow> = {}): LeasePipelineRow {
  return {
    id: "lease_evidence_1",
    residentName: "Jordan Lee",
    residentEmail: "jordan.lee@example.com",
    unit: "Unit A",
    stageLabel: "Signed",
    updated: "Jul 1",
    bucket: "signed",
    pdfVersion: 2,
    notes: "",
    updatedAtIso: "2026-07-01T00:00:00.000Z",
    managerUserId: MANAGER_ID,
    thread: [],
    generatedHtml: "<html><body>EXECUTED LEASE TEXT</body></html>",
    generatedAtIso: "2026-07-01T00:00:00.000Z",
    status: "Fully Signed",
    residentSignature: { role: "resident", name: "Jordan Lee", signedAtIso: "2026-07-01T00:00:00.000Z" },
    managerSignature: { role: "manager", name: "Pat Manager", signedAtIso: "2026-07-01T01:00:00.000Z" },
    ...overrides,
  };
}

describe("signed lease documents are immutable", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    window.history.replaceState({}, "", "/portal/leases");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
  });

  it("refuses to replace the document body of a signed row through the real write path", () => {
    seedDemoLeasePipeline([signedRow()], MANAGER_ID);

    updateLeasePipelineRow(
      "lease_evidence_1",
      { generatedHtml: "<html><body>TAMPERED LEASE TEXT</body></html>" },
      MANAGER_ID,
    );

    const stored = readLeasePipeline(MANAGER_ID).find((r) => r.id === "lease_evidence_1");
    expect(stored?.generatedHtml).toContain("EXECUTED LEASE TEXT");
    expect(stored?.generatedHtml).not.toContain("TAMPERED");
  });

  it("blocks the manager-edit persistence path after either party has signed", () => {
    seedDemoLeasePipeline([signedRow()], MANAGER_ID);

    const result = saveLeaseDocumentHtml(
      "lease_evidence_1",
      "<html><body>FORGED LEASE TEXT</body></html>",
      MANAGER_ID,
    );

    expect(result).toEqual({ ok: false, error: "This lease can no longer be edited." });
    expect(readLeasePipeline(MANAGER_ID)[0]?.generatedHtml).toContain("EXECUTED LEASE TEXT");
  });

  it("versions and sanitizes every saved manager edit", () => {
    const unsigned = signedRow({
      residentSignature: null,
      managerSignature: null,
      status: "Manager Review",
      bucket: "manager",
      versionNumber: 2,
      pdfVersion: 2,
    });
    seedDemoLeasePipeline([unsigned], MANAGER_ID);

    const result = saveLeaseDocumentHtml(
      "lease_evidence_1",
      '<html><body><p onclick="alert(1)">Edited text</p><script>alert(2)</script><a href="javascript:alert(3)">bad</a></body></html>',
      MANAGER_ID,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.row.versionNumber).toBe(3);
      expect(result.row.pdfVersion).toBe(3);
      expect(result.row.generatedAtIso).toBeTruthy();
      expect(result.row.managerDocumentEditedAtIso).toBeTruthy();
      expect(result.row.generatedHtml).toContain("Edited text");
      expect(result.row.generatedHtml).not.toMatch(/script|onclick|javascript:|<a\b/i);
    }
  });

  it("requires confirmation before regeneration replaces manual body edits", () => {
    const unsigned = signedRow({
      residentSignature: null,
      managerSignature: null,
      status: "Manager Review",
      bucket: "manager",
      managerDocumentEditedAtIso: "2026-07-02T00:00:00.000Z",
    });
    seedDemoLeasePipeline([unsigned], MANAGER_ID);

    expect(generateLeaseHtmlForRow("lease_evidence_1", MANAGER_ID)).toEqual({
      ok: false,
      error: "This lease has manager edits. Confirm regeneration to replace them with current lease terms.",
    });
  });

  it("refuses to swap a signed row's uploaded PDF", () => {
    const prev = [signedRow({ generatedHtml: null, managerUploadedPdf: { dataUrl: "data:application/pdf;base64,AAA", originalDataUrl: "data:application/pdf;base64,AAA", fileName: "lease.pdf", uploadedAt: "2026-07-01T00:00:00.000Z" } })];
    const next = [
      {
        ...prev[0]!,
        managerUploadedPdf: { dataUrl: "data:application/pdf;base64,ZZZ", originalDataUrl: "data:application/pdf;base64,ZZZ", fileName: "other.pdf", uploadedAt: "2026-07-02T00:00:00.000Z" },
      },
    ];

    expect(preserveSignedLeaseDocuments(prev, next)[0]!.managerUploadedPdf).toEqual(prev[0]!.managerUploadedPdf);
  });

  it("still allows the certificate page to be merged into a signed row's PDF", () => {
    const base = { dataUrl: "data:application/pdf;base64,AAA", originalDataUrl: "data:application/pdf;base64,AAA", fileName: "lease.pdf", uploadedAt: "2026-07-01T00:00:00.000Z" };
    const prev = [signedRow({ generatedHtml: null, managerUploadedPdf: base })];
    const next = [{ ...prev[0]!, managerUploadedPdf: { ...base, dataUrl: "data:application/pdf;base64,AAAWITHCERT" } }];

    expect(preserveSignedLeaseDocuments(prev, next)[0]!.managerUploadedPdf?.dataUrl).toBe(
      "data:application/pdf;base64,AAAWITHCERT",
    );
  });

  it("leaves unsigned rows editable", () => {
    const prev = [signedRow({ residentSignature: null, managerSignature: null, status: "Manager Review", bucket: "manager" })];
    const next = [{ ...prev[0]!, generatedHtml: "<html><body>REGENERATED</body></html>" }];

    expect(preserveSignedLeaseDocuments(prev, next)[0]!.generatedHtml).toContain("REGENERATED");
  });

  it("allows a superseding document once the signatures are cleared", () => {
    const prev = [signedRow()];
    const next = [
      {
        ...prev[0]!,
        residentSignature: null,
        managerSignature: null,
        status: "Manager Review" as const,
        bucket: "manager" as const,
        generatedHtml: "<html><body>RENEWAL LEASE TEXT</body></html>",
      },
    ];

    expect(preserveSignedLeaseDocuments(prev, next)[0]!.generatedHtml).toContain("RENEWAL");
  });

  it("lets existing-resident onboarding file an off-platform lease onto a row that never had one", () => {
    const prev = [signedRow({ generatedHtml: null, externallySignedLease: true })];
    const next = [
      {
        ...prev[0]!,
        managerUploadedPdf: { dataUrl: "data:application/pdf;base64,AAA", originalDataUrl: "data:application/pdf;base64,AAA", fileName: "signed.pdf", uploadedAt: "2026-07-02T00:00:00.000Z" },
      },
    ];

    expect(preserveSignedLeaseDocuments(prev, next)[0]!.managerUploadedPdf?.fileName).toBe("signed.pdf");
  });
});
