import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { snapshotJordanLee } from "@/data/manager-application-snapshots";
import { leaseContextFromApplication } from "@/lib/generated-lease";
import { LEASE_ESIGN_CONSENT_VERSION } from "@/lib/lease-execution-evidence";
import {
  appendSignaturePageToPdf,
  buildLeaseSignaturePagePdf,
} from "@/lib/lease-pdf-signing";
import type { LeasePipelineRow } from "@/lib/lease-pipeline-storage";


async function createMinimalPdfDataUrl(): Promise<string> {
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]);
  const bytes = await doc.save();
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return `data:application/pdf;base64,${btoa(binary)}`;
}

function sampleRow(): LeasePipelineRow {
  const app = snapshotJordanLee();
  const ctx = leaseContextFromApplication(app);
  return {
    id: "lease-test-1",
    residentName: "Jordan Lee",
    residentEmail: "jordan.lee@example.com",
    unit: ctx.listingProperty?.title ?? "Test unit",
    stageLabel: "Manager Review",
    updated: "now",
    bucket: "resident",
    pdfVersion: 1,
    notes: "",
    updatedAtIso: new Date().toISOString(),
    thread: [],
    residentSignature: {
      role: "resident",
      name: "Jordan Lee",
      signedAtIso: new Date().toISOString(),
    },
  };
}

/** Every evidence line populated, including the fields later agents will write. */
function fullEvidenceRow(): LeasePipelineRow {
  const row = sampleRow();
  return {
    ...row,
    documentSha256: "3f9ac21088d14e77" + "a".repeat(48),
    templateVersion: "ca-residential@1.2.0",
    executedJurisdiction: "US-CA/san_francisco",
    residentSignature: {
      ...row.residentSignature!,
      documentSha256: "3f9ac21088d14e77" + "a".repeat(48),
      consentVersion: LEASE_ESIGN_CONSENT_VERSION,
    },
    managerSignature: {
      role: "manager",
      name: "Pat Manager",
      signedAtIso: new Date().toISOString(),
      documentSha256: "f".repeat(64),
      consentVersion: LEASE_ESIGN_CONSENT_VERSION,
    },
  };
}

describe("lease-pdf-signing", () => {
  it("builds a signature certificate PDF", async () => {
    const bytes = await buildLeaseSignaturePagePdf(sampleRow());
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it("appends signature page to uploaded PDF", async () => {
    const merged = await appendSignaturePageToPdf(await createMinimalPdfDataUrl(), sampleRow());
    const bytes = Uint8Array.from(atob(merged.split(",")[1] ?? ""), (c) => c.charCodeAt(0));
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2);
  });

  it("draws the full evidence certificate — hashes, provenance, divergence warning and consent — on one page", async () => {
    const bytes = await buildLeaseSignaturePagePdf(fullEvidenceRow());
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    // The page count is 1 by construction, so it proves nothing on its own.
    // `put` silently skips any line that would fall below the bottom margin, so
    // the evidence lines are only really there if they cost bytes.
    const bare = await buildLeaseSignaturePagePdf(sampleRow());
    expect(bytes.byteLength).toBeGreaterThan(bare.byteLength + 400);
  });

  it("does not throw away the certificate when a name is outside the PDF standard font", async () => {
    // pdf-lib's standard fonts are WinAnsi-only and throw on anything else; the
    // caller swallows that, which would ship a signed PDF with no certificate.
    const row = fullEvidenceRow();
    const bytes = await buildLeaseSignaturePagePdf({
      ...row,
      residentName: "李 明 🏠",
      unit: "Ünit — Ω",
      residentSignature: { ...row.residentSignature!, name: "李 明" },
    });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });
});
