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

  it("fits the full evidence certificate — hashes, provenance, divergence warning and consent — on one page", async () => {
    const row = sampleRow();
    const bytes = await buildLeaseSignaturePagePdf({
      ...row,
      documentSha256: "3f9ac21088d14e77aa11bb22cc33dd44ee55ff6600112233445566778899aabb",
      templateVersion: "ca-residential@1.2.0",
      executedJurisdiction: "US-CA/san_francisco",
      residentSignature: { ...row.residentSignature!, documentSha256: "3f9ac21088d14e77", consentVersion: LEASE_ESIGN_CONSENT_VERSION },
      managerSignature: {
        role: "manager",
        name: "Pat Manager",
        signedAtIso: new Date().toISOString(),
        documentSha256: "ffffffffffffffff",
        consentVersion: LEASE_ESIGN_CONSENT_VERSION,
      },
    });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });
});
