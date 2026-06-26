import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { snapshotJordanLee } from "@/data/manager-application-snapshots";
import { leaseContextFromApplication } from "@/lib/generated-lease";
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
});
