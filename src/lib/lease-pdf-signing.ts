import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
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

export async function buildLeaseSignaturePagePdf(row: LeasePipelineRow): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const margin = 54;
  let y = 720;

  const draw = (text: string, size: number, font = regular) => {
    page.drawText(text, { x: margin, y, size, font, color: rgb(0.1, 0.1, 0.1) });
    y -= size + 10;
  };

  draw("Electronic Signature Certificate", 16, bold);
  y -= 6;
  draw(`Property: ${row.unit}`, 11);
  draw(`Resident: ${row.residentName}`, 11);
  draw(`Lease record: ${row.id}`, 10);
  y -= 8;
  draw("Resident / Tenant", 12, bold);
  draw(signatureLine(row, "resident"), 11);
  y -= 8;
  draw("Landlord / Manager", 12, bold);
  draw(signatureLine(row, "manager"), 11);
  y -= 16;
  draw("Signatures apply to the attached lease document.", 10);
  draw("Typed names captured through the Axis portal constitute electronic signatures.", 9);

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
