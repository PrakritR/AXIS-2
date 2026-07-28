import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  LEASE_ESIGN_CONSENT_TEXT,
  LEASE_ESIGN_CONSENT_VERSION,
  documentFingerprintLabel,
  signedDocumentHashesDiverge,
} from "@/lib/lease-execution-evidence";
import type { LeasePipelineRow } from "@/lib/lease-pipeline-storage";
import { formatPacificDateTime } from "@/lib/pacific-time";

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1] ?? "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToDataUrl(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return `data:application/pdf;base64,${btoa(binary)}`;
}

function signatureLine(row: LeasePipelineRow, role: "resident" | "manager"): string {
  const sig = role === "resident" ? row.residentSignature : row.managerSignature;
  if (!sig?.name) return "Pending";
  return `Signed by ${sig.name} · ${formatPacificDateTime(new Date(sig.signedAtIso))}`;
}

/** Per-signature evidence lines, omitted for signatures recorded before they existed. */
function signatureEvidenceLines(row: LeasePipelineRow, role: "resident" | "manager"): string[] {
  const sig = role === "resident" ? row.residentSignature : row.managerSignature;
  if (!sig?.name) return [];
  const fingerprint = documentFingerprintLabel(sig.documentSha256);
  return [
    fingerprint ? `Document signed: ${fingerprint}` : "",
    sig.consentVersion ? "Consented to transact electronically before signing." : "",
  ].filter(Boolean);
}

export async function buildLeaseSignaturePagePdf(row: LeasePipelineRow): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const margin = 54;
  const maxWidth = 612 - margin * 2;
  let y = 720;

  const draw = (text: string, size: number, font = regular) => {
    page.drawText(text, { x: margin, y, size, font, color: rgb(0.1, 0.1, 0.1) });
    y -= size + 10;
  };

  const drawWrapped = (text: string, size: number, font = regular) => {
    let line = "";
    for (const word of text.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && font.widthOfTextAtSize(candidate, size) > maxWidth) {
        page.drawText(line, { x: margin, y, size, font, color: rgb(0.1, 0.1, 0.1) });
        y -= size + 3;
        line = word;
        continue;
      }
      line = candidate;
    }
    if (line) {
      page.drawText(line, { x: margin, y, size, font, color: rgb(0.1, 0.1, 0.1) });
      y -= size + 10;
    }
  };

  draw("Electronic Signature Certificate", 16, bold);
  y -= 6;
  draw(`Property: ${row.unit}`, 11);
  draw(`Resident: ${row.residentName}`, 11);
  draw(`Lease record: ${row.id}`, 10);
  y -= 8;
  draw("Resident / Tenant", 12, bold);
  draw(signatureLine(row, "resident"), 11);
  for (const line of signatureEvidenceLines(row, "resident")) draw(line, 9);
  y -= 8;
  draw("Landlord / Manager", 12, bold);
  draw(signatureLine(row, "manager"), 11);
  for (const line of signatureEvidenceLines(row, "manager")) draw(line, 9);
  y -= 16;
  draw("Signatures apply to the attached lease document.", 10);
  draw("Typed names captured through the PropLane portal constitute electronic signatures.", 9);

  if (signedDocumentHashesDiverge(row)) {
    y -= 6;
    drawWrapped(
      "Warning: the two parties did not sign identical documents. Each fingerprint above identifies the document that party actually signed.",
      9,
      bold,
    );
  }

  const fingerprint = documentFingerprintLabel(row.documentSha256);
  const provenance = [
    fingerprint ? `Document fingerprint (SHA-256): ${fingerprint}` : "",
    row.templateVersion ? `Lease template: ${row.templateVersion}` : "",
    row.executedJurisdiction ? `Executed under: ${row.executedJurisdiction}` : "",
  ].filter(Boolean);
  if (provenance.length > 0) {
    y -= 6;
    for (const line of provenance) draw(line, 9);
    drawWrapped(
      "The fingerprint is a SHA-256 checksum of the lease document exactly as it was presented for signature; it does not cover this certificate page. Any later change to the document, however small, produces a different fingerprint.",
      8,
    );
  }

  const consented =
    row.residentSignature?.consentVersion === LEASE_ESIGN_CONSENT_VERSION ||
    row.managerSignature?.consentVersion === LEASE_ESIGN_CONSENT_VERSION;
  if (consented) {
    y -= 4;
    drawWrapped(`Consent accepted before signing: "${LEASE_ESIGN_CONSENT_TEXT}"`, 8);
  }

  return pdf.save();
}

export async function appendSignaturePageToPdf(originalDataUrl: string, row: LeasePipelineRow): Promise<string> {
  const baseDoc = await PDFDocument.load(dataUrlToBytes(originalDataUrl));
  const sigBytes = await buildLeaseSignaturePagePdf(row);
  const sigDoc = await PDFDocument.load(sigBytes);
  const [sigPage] = await baseDoc.copyPages(sigDoc, [0]);
  baseDoc.addPage(sigPage);
  return bytesToDataUrl(await baseDoc.save());
}

export function getLeasePdfBaseDataUrl(row: LeasePipelineRow): string | null {
  const pdf = row.managerUploadedPdf;
  if (!pdf?.dataUrl) return null;
  return pdf.originalDataUrl ?? pdf.dataUrl;
}

export function getLeasePdfForDisplay(row: LeasePipelineRow): string | null {
  return row.managerUploadedPdf?.dataUrl ?? null;
}

export async function mergeUploadedLeasePdfWithSignatures(row: LeasePipelineRow): Promise<string | null> {
  const base = getLeasePdfBaseDataUrl(row);
  if (!base) return null;
  if (!row.residentSignature && !row.managerSignature) return base;
  return appendSignaturePageToPdf(base, row);
}
