/**
 * Client-built document files for the `/demo` sandbox. The real Documents tabs
 * download application PDFs and rent receipts from authenticated API routes;
 * the demo builds equivalent PDFs in the browser (pdf-lib is already the PDF
 * engine for the server application PDF) and hands back data URLs that work in
 * both the inline preview iframe and the download anchor. Import this module
 * dynamically from demo code paths only — it must stay out of the real portal
 * bundles.
 */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { DemoApplicantRow } from "@/data/demo-portal";
import { buildApplicationPdf } from "@/lib/manager-application-pdf";

function bytesToPdfDataUrl(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:application/pdf;base64,${btoa(binary)}`;
}

/** The resident's rental application as a locally-built PDF data URL. */
export async function buildDemoApplicationPdfDataUrl(
  row: DemoApplicantRow,
  roomLabel?: string,
): Promise<string> {
  const bytes = await buildApplicationPdf(row, roomLabel ? { roomLabel } : {});
  return bytesToPdfDataUrl(bytes);
}

/** A one-payment rent receipt as a locally-built PDF data URL. */
export async function buildDemoReceiptPdfDataUrl(input: {
  residentName: string;
  description: string;
  amountLabel: string;
  dateLabel: string;
}): Promise<string> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const ink = rgb(0.13, 0.15, 0.19);
  const muted = rgb(0.42, 0.45, 0.52);

  let y = 716;
  const line = (text: string, font = regular, size = 11, color = ink) => {
    page.drawText(text, { x: 72, y, size, font, color });
    y -= size + 12;
  };

  line("RENT RECEIPT", bold, 18);
  line("Axis Housing Management · Seattle, WA", regular, 10, muted);
  y -= 16;
  line(`Received from:  ${input.residentName}`);
  line(`For:            ${input.description}`);
  line(`Amount paid:    ${input.amountLabel}`);
  line(`Payment date:   ${input.dateLabel}`);
  line("Payment method: Axis ACH");
  y -= 16;
  line("Thank you — this receipt confirms your payment was recorded.", regular, 10, muted);
  line("Sample receipt generated for the Axis interactive demo.", regular, 9, muted);

  return bytesToPdfDataUrl(await pdf.save());
}
