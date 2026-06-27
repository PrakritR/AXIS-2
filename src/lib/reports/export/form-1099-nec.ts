import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { formatTinForDisplay } from "@/lib/reports/tin-crypto";

export type Form1099NecInput = {
  taxYear: number;
  payer: {
    name: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state: string;
    zip: string;
    tin: string;
    tinType: "ein" | "ssn";
  };
  recipient: {
    name: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state: string;
    zip: string;
    tin: string;
    tinType: "ein" | "ssn";
  };
  nonemployeeCompensationCents: number;
};

export async function build1099NecPdf(input: Form1099NecInput): Promise<Uint8Array> {
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

  draw(`Form 1099-NEC — ${input.taxYear}`, 16, bold);
  draw("Copy B — For Recipient", 11, bold);
  y -= 8;

  draw("PAYER", 12, bold);
  draw(input.payer.name, 11);
  draw(input.payer.addressLine1, 11);
  if (input.payer.addressLine2) draw(input.payer.addressLine2, 11);
  draw(`${input.payer.city}, ${input.payer.state} ${input.payer.zip}`, 11);
  draw(
    `${input.payer.tinType.toUpperCase()}: ${formatTinForDisplay(input.payer.tin, input.payer.tinType)}`,
    11,
  );
  y -= 8;

  draw("RECIPIENT", 12, bold);
  draw(input.recipient.name, 11);
  draw(input.recipient.addressLine1, 11);
  if (input.recipient.addressLine2) draw(input.recipient.addressLine2, 11);
  draw(`${input.recipient.city}, ${input.recipient.state} ${input.recipient.zip}`, 11);
  draw(
    `${input.recipient.tinType.toUpperCase()}: ${formatTinForDisplay(input.recipient.tin, input.recipient.tinType)}`,
    11,
  );
  y -= 12;

  const amount = (input.nonemployeeCompensationCents / 100).toFixed(2);
  draw("Box 1 — Nonemployee compensation", 12, bold);
  draw(`$${amount}`, 14, bold);
  y -= 16;
  draw("This is not an official IRS form. Download for your records and file via your accountant.", 9);

  return pdf.save();
}
