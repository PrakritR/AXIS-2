import { formatTinForDisplay } from "@/lib/reports/tin-crypto";
import {
  createPdfTheme,
  drawDocumentHeader,
  drawHighlightLine,
  drawInfoBlock,
  drawStandardFooter,
  drawText,
  PDF_PAGE,
} from "@/lib/reports/export/pdf-theme";

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

const CONTENT_WIDTH = PDF_PAGE.width - PDF_PAGE.margin * 2;

export async function build1099NecPdf(input: Form1099NecInput): Promise<Uint8Array> {
  const theme = await createPdfTheme();
  const { pdf, regular } = theme;
  const page = pdf.addPage([PDF_PAGE.width, PDF_PAGE.height]);
  let y = drawDocumentHeader(page, theme, {
    title: `Form 1099-NEC — ${input.taxYear}`,
    subtitle: "Copy B — For Recipient",
    contentWidth: CONTENT_WIDTH,
  });
  y -= 4;

  y = drawInfoBlock(page, theme, {
    label: "Payer",
    lines: [
      input.payer.name,
      input.payer.addressLine1,
      input.payer.addressLine2 ?? "",
      `${input.payer.city}, ${input.payer.state} ${input.payer.zip}`,
      `${input.payer.tinType.toUpperCase()}: ${formatTinForDisplay(input.payer.tin, input.payer.tinType)}`,
    ],
    x: PDF_PAGE.margin,
    y,
    width: CONTENT_WIDTH,
  });
  y -= 12;

  y = drawInfoBlock(page, theme, {
    label: "Recipient",
    lines: [
      input.recipient.name,
      input.recipient.addressLine1,
      input.recipient.addressLine2 ?? "",
      `${input.recipient.city}, ${input.recipient.state} ${input.recipient.zip}`,
      `${input.recipient.tinType.toUpperCase()}: ${formatTinForDisplay(input.recipient.tin, input.recipient.tinType)}`,
    ],
    x: PDF_PAGE.margin,
    y,
    width: CONTENT_WIDTH,
  });
  y -= 16;

  const amount = (input.nonemployeeCompensationCents / 100).toFixed(2);
  y = drawHighlightLine(page, theme, {
    label: "Box 1 — Nonemployee compensation",
    value: `$${amount}`,
    x: PDF_PAGE.margin,
    y,
    width: CONTENT_WIDTH,
  });
  y -= 14;

  drawText(
    page,
    "This is not an official IRS form. Download for your records and file via your accountant.",
    PDF_PAGE.margin,
    y,
    9,
    regular,
    undefined,
    CONTENT_WIDTH,
  );

  drawStandardFooter(theme, CONTENT_WIDTH);
  return pdf.save();
}
