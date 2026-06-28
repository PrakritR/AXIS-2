import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  DAYS_RENTED_FOOTER,
  RENT_RECEIPT_FOOTER,
  type DaysRentedDocument,
  type FormalFieldKey,
  type PropertyRentReceiptDocument,
  type RentReceiptDocument,
} from "@/lib/reports/formal-documents/spec";

function includes(fields: FormalFieldKey[] | undefined, key: FormalFieldKey): boolean {
  if (!fields?.length) return true;
  return fields.includes(key);
}

async function createPdfWriter(title: string) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const margin = 54;
  let y = 720;

  const draw = (text: string, size: number, font = regular) => {
    if (y < 54) return;
    for (const line of text.split("\n")) {
      page.drawText(line.slice(0, 100), { x: margin, y, size, font, color: rgb(0.1, 0.1, 0.1) });
      y -= size + 6;
    }
  };

  draw("Axis", 10, bold);
  draw(title, 16, bold);
  y -= 4;

  return { pdf, draw, bold, regular };
}

export async function buildRentReceiptPdf(
  doc: RentReceiptDocument,
  includeFields?: FormalFieldKey[],
): Promise<Uint8Array> {
  const { pdf, draw, bold } = await createPdfWriter("Rent Receipt");

  if (includes(includeFields, "receiptNumber")) draw(`Receipt #: ${doc.receiptNumber}`, 11, bold);
  if (includes(includeFields, "issueDate")) draw(`Issue date: ${doc.issueDate}`, 10);

  if (includes(includeFields, "landlordBlock")) {
    yPad(draw);
    draw("Received by (landlord)", 11, bold);
    draw(doc.landlordName, 10);
    draw(doc.landlordAddress, 10);
  }

  if (includes(includeFields, "tenantBlock")) {
    yPad(draw);
    draw("Paid by (tenant)", 11, bold);
    draw(doc.tenantName, 10);
    draw(doc.tenantEmail, 10);
  }

  if (includes(includeFields, "propertyBlock")) {
    yPad(draw);
    draw("Rental property", 11, bold);
    draw(`${doc.propertyLabel} · ${doc.unitLabel}`, 10);
    draw(doc.propertyAddress, 10);
  }

  yPad(draw);
  if (includes(includeFields, "paymentDate")) draw(`Payment date: ${doc.paymentDate}`, 10);
  if (includes(includeFields, "amount")) draw(`Amount received: ${doc.amount}`, 12, bold);
  if (includes(includeFields, "paymentMethod")) draw(`Payment method: ${doc.paymentMethod}`, 10);
  if (includes(includeFields, "periodCovered")) draw(`Period / description: ${doc.periodCovered}`, 10);
  if (includes(includeFields, "category")) draw(`Category: ${doc.category}`, 10);
  if (includes(includeFields, "daysRented") && doc.daysRented != null) {
    draw(`Days rented (period): ${doc.daysRented}`, 10);
  }
  if (includes(includeFields, "daysAvailable") && doc.daysAvailable != null) {
    draw(`Days available (period): ${doc.daysAvailable}`, 10);
  }
  if (includes(includeFields, "balanceAfter") && doc.balanceAfter) {
    draw(`Balance after payment: ${doc.balanceAfter}`, 10);
  }

  yPad(draw);
  draw(RENT_RECEIPT_FOOTER, 9);

  return pdf.save();
}

export async function buildDaysRentedPdf(
  doc: DaysRentedDocument,
  includeFields?: FormalFieldKey[],
): Promise<Uint8Array> {
  const { pdf, draw, bold } = await createPdfWriter("Days Rented Statement");

  if (includes(includeFields, "issueDate")) draw(`Issue date: ${doc.issueDate}`, 10);
  draw(`Period: ${doc.periodFrom} — ${doc.periodTo}`, 10);
  draw(`Scope: ${doc.scopeLabel}`, 10, bold);

  if (includes(includeFields, "landlordBlock")) {
    yPad(draw);
    draw("Landlord", 11, bold);
    draw(doc.landlordName, 10);
    draw(doc.landlordAddress, 10);
  }

  yPad(draw);
  draw("Occupancy summary", 11, bold);
  for (const row of doc.rows.slice(0, 30)) {
    draw(
      `${row.property} · ${row.unit} · ${row.resident}: ${row.daysRented} days rented / ${row.daysAvailable} available`,
      9,
    );
  }

  yPad(draw);
  if (includes(includeFields, "daysRented")) {
    draw(`Total days rented: ${doc.totalDaysRented}`, 11, bold);
  }
  if (includes(includeFields, "daysAvailable")) {
    draw(`Units in scope: ${doc.unitCount}`, 10);
  }

  if (includes(includeFields, "personalUseNote")) {
    yPad(draw);
    draw(DAYS_RENTED_FOOTER, 9);
  }

  return pdf.save();
}

function yPad(draw: (text: string, size: number) => void) {
  draw("", 4);
}

export async function buildRentReceiptsCombinedPdf(
  documents: RentReceiptDocument[],
  includeFields?: FormalFieldKey[],
): Promise<Uint8Array> {
  if (documents.length === 1) {
    return buildRentReceiptPdf(documents[0]!, includeFields);
  }
  const pdf = await PDFDocument.create();
  for (const doc of documents) {
    const single = await buildRentReceiptPdf(doc, includeFields);
    const loaded = await PDFDocument.load(single);
    const pages = await pdf.copyPages(loaded, loaded.getPageIndices());
    for (const p of pages) pdf.addPage(p);
  }
  return pdf.save();
}

export async function buildPropertyRentReceiptPdf(
  doc: PropertyRentReceiptDocument,
  includeFields?: FormalFieldKey[],
): Promise<Uint8Array> {
  const { pdf, draw, bold } = await createPdfWriter("Property Rent Receipt");

  if (includes(includeFields, "issueDate")) draw(`Issue date: ${doc.issueDate}`, 10);
  draw(`Period: ${doc.periodFrom} — ${doc.periodTo}`, 10);

  if (includes(includeFields, "landlordBlock")) {
    yPad(draw);
    draw("Landlord", 11, bold);
    draw(doc.landlordName, 10);
    draw(doc.landlordAddress, 10);
  }

  if (includes(includeFields, "propertyBlock")) {
    yPad(draw);
    draw("Rental property", 11, bold);
    draw(doc.propertyLabel, 10);
  }

  yPad(draw);
  draw("Occupancy & income summary", 11, bold);
  if (includes(includeFields, "daysRented")) draw(`Total days rented: ${doc.daysRented}`, 11, bold);
  if (includes(includeFields, "daysAvailable")) draw(`Total days available: ${doc.daysAvailable}`, 10);
  draw(`Rental use: ${doc.rentalUsePct}%`, 10);
  if (includes(includeFields, "amount")) draw(`Rent collected: ${doc.rentCollected}`, 12, bold);
  if (includes(includeFields, "periodCovered")) draw(`Payment receipts: ${doc.receiptCount}`, 10);

  yPad(draw);
  draw("By unit", 11, bold);
  for (const unit of doc.units.slice(0, 25)) {
    draw(
      `${unit.unit} · ${unit.resident}: ${unit.daysRented}/${unit.daysAvailable} days · ${unit.rentCollected} (${unit.receiptCount} receipt${unit.receiptCount === 1 ? "" : "s"})`,
      9,
    );
  }

  if (includes(includeFields, "personalUseNote")) {
    yPad(draw);
    draw(DAYS_RENTED_FOOTER, 9);
  }

  return pdf.save();
}

export async function buildPropertyRentReceiptsCombinedPdf(
  documents: PropertyRentReceiptDocument[],
  includeFields?: FormalFieldKey[],
): Promise<Uint8Array> {
  if (documents.length === 1) {
    return buildPropertyRentReceiptPdf(documents[0]!, includeFields);
  }
  const pdf = await PDFDocument.create();
  for (const doc of documents) {
    const single = await buildPropertyRentReceiptPdf(doc, includeFields);
    const loaded = await PDFDocument.load(single);
    const pages = await pdf.copyPages(loaded, loaded.getPageIndices());
    for (const p of pages) pdf.addPage(p);
  }
  return pdf.save();
}
