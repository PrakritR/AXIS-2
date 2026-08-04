// @vitest-environment jsdom
//
// Proves the PDF side actually produces a file: the signature certificate page, the Terms
// Rider appended to a manager's uploaded lease, and the full merge order. Writes real PDFs to
// disk so a human can open them and judge the layout.
import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  appendSignaturePageToPdf,
  buildLeaseSignaturePagePdf,
} from "@/lib/lease-pdf-signing";
import type { LeasePipelineRow } from "@/lib/lease-pipeline-storage";

const OUT = process.env.LEASE_ARTIFACT_DIR ?? "";

function save(name: string, bytes: Uint8Array) {
  if (!OUT) return;
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, name), bytes);
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1] ?? "";
  return Uint8Array.from(Buffer.from(base64, "base64"));
}

/** A stand-in for the manager's own uploaded lease PDF. */
async function managerUploadedPdf(): Promise<string> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("MANAGER'S OWN LEASE DOCUMENT", { x: 72, y: 700, size: 16, font });
  page.drawText("This page stands in for an attorney-drafted lease.", { x: 72, y: 670, size: 11, font });
  const bytes = await doc.save();
  return `data:application/pdf;base64,${Buffer.from(bytes).toString("base64")}`;
}

const SIGNED_ROW = {
  id: "lease-pdf-artifact",
  residentName: "Arnav Shanbhag",
  residentEmail: "arnav@example.com",
  managerName: "Prakrit Ramachandran",
  unit: "Brooklyn House, Room 7",
  status: "Fully Signed",
  executedJurisdiction: "US-WA/seattle",
  templateVersion: "seattle-residential@1.0.0",
  residentSignature: {
    name: "Arnav Shanbhag",
    signedAtIso: "2026-09-01T17:04:00.000Z",
    documentSha256: "a".repeat(64),
    consentVersion: "esign-consent-v1",
  },
  managerSignature: {
    name: "Prakrit Ramachandran",
    signedAtIso: "2026-09-01T18:12:00.000Z",
    documentSha256: "a".repeat(64),
    consentVersion: "esign-consent-v1",
  },
} as unknown as LeasePipelineRow;

describe("lease PDFs are really produced", () => {
  it("builds a signature certificate page", async () => {
    const bytes = await buildLeaseSignaturePagePdf(SIGNED_ROW);
    save("pdf-01-signature-certificate.pdf", bytes);

    // A real PDF, not an empty buffer.
    expect(bytes.byteLength).toBeGreaterThan(500);
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");

    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it("appends the certificate AFTER the manager's document, keeping their pages intact", async () => {
    const original = await managerUploadedPdf();
    const originalPages = (await PDFDocument.load(dataUrlToBytes(original))).getPageCount();

    const merged = await appendSignaturePageToPdf(original, SIGNED_ROW);
    const bytes = dataUrlToBytes(merged);
    save("pdf-02-manager-lease-plus-certificate.pdf", bytes);

    const doc = await PDFDocument.load(bytes);
    // The manager's own pages survive and the certificate is added, never substituted.
    expect(doc.getPageCount()).toBe(originalPages + 1);
    expect(bytes.byteLength).toBeGreaterThan(dataUrlToBytes(original).byteLength);
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
  });

  it("the certificate carries the provenance a dispute would turn on", async () => {
    const bytes = await buildLeaseSignaturePagePdf(SIGNED_ROW);
    // Content streams are compressed, so read the text the way a PDF reader would rather
    // than grepping the raw bytes.
    const { extractText, getDocumentProxy } = await import("unpdf");
    const doc = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(doc, { mergePages: true });
    const flat = String(text).replace(/\s+/g, " ");

    expect(flat).toContain("Arnav Shanbhag");
    expect(flat).toContain("Prakrit Ramachandran");
    // The document fingerprint, printed UPPERCASE in readable four-character groups.
    expect(flat).toContain("AAAA AAAA");
    expect(flat).toContain("fingerprint");
    // It must say plainly that the fingerprint does not cover the certificate page itself,
    // since a certificate cannot hash itself and a reader would otherwise assume it does.
    expect(flat).toContain("does not cover this certificate page");
    // And the property, which must never render as "undefined" on a legal artifact.
    expect(flat).toContain("Brooklyn House, Room 7");
    expect(flat).not.toContain("undefined");
    // And the governing law that produced it.
    expect(flat).toContain("US-WA/seattle");
  });
});
