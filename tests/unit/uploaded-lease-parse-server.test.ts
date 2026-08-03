/**
 * End to end over a REAL multi-page PDF: bytes in, PropLane structure out.
 *
 * This is the test that would catch a page-splitting or text-extraction
 * regression that the pure-text tests cannot see, and it proves the page
 * numbers a reviewer relies on actually point at the right page.
 */
import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { parseUploadedLeasePdfBytes } from "@/lib/uploaded-lease-parse.server";
import { buildUploadedLeaseProplaneHtml } from "@/lib/uploaded-lease-proplane-format";

const PAGE_LINES: string[][] = [
  [
    "RESIDENTIAL LEASE AGREEMENT",
    "",
    "This Agreement is made between Harbour Point Holdings LLC (\"Landlord\")",
    "and Dana Whitfield (\"Tenant\").",
    "",
    "1. PREMISES",
    "The premises located at 44 Alder Way, Unit 3, Fremont, CA 94536.",
  ],
  [
    "2. TERM",
    "The term shall commence on March 1, 2026 and shall end on February 28, 2027.",
    "",
    "3. RENT",
    "Monthly rent is $2,150.00, due on the 1st day of each calendar month.",
  ],
  [
    "4. UNUSUAL RIDER",
    "Tenant may keep one registered emotional support parrot in the sunroom.",
    "",
    "5. QUIET ENJOYMENT",
    "Tenant shall not disturb the peaceful enjoyment of other occupants.",
  ],
];

async function buildLeasePdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const lines of PAGE_LINES) {
    const page = pdf.addPage([612, 792]);
    let y = 720;
    for (const line of lines) {
      if (line) page.drawText(line, { x: 54, y, size: 11, font });
      y -= 18;
    }
  }
  return pdf.save();
}

describe("parsing a real multi-page lease PDF", () => {
  it("reads every page, structures it, and anchors each field to its page", async () => {
    const parse = await parseUploadedLeasePdfBytes({
      bytes: await buildLeasePdf(),
      fileName: "harbour-point.pdf",
      nowIso: "2026-08-01T00:00:00.000Z",
    });

    expect(parse.status).toBe("parsed");
    expect(parse.pageCount).toBe(3);
    expect(parse.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(parse.review.status).toBe("needs_review");

    const rent = parse.fields.find((f) => f.key === "monthlyRent");
    expect(rent?.status).toBe("extracted");
    expect(rent?.normalized).toBe("2150.00");
    expect(rent?.source?.page).toBe(2); // rent is on page 2, and the trace says so

    const tenant = parse.fields.find((f) => f.key === "tenantName");
    expect(tenant?.value).toBe("Dana Whitfield");
    expect(tenant?.source?.page).toBe(1);

    // A term the document never states stays blank rather than being assumed.
    const deposit = parse.fields.find((f) => f.key === "securityDeposit");
    expect(deposit?.status).toBe("not_found");
    expect(deposit?.value).toBe("");
  });

  it("renders every line of the source into the PropLane document", async () => {
    const parse = await parseUploadedLeasePdfBytes({
      bytes: await buildLeasePdf(),
      fileName: "harbour-point.pdf",
      nowIso: "2026-08-01T00:00:00.000Z",
    });
    const html = buildUploadedLeaseProplaneHtml({ parse, placement: { residentName: "Dana Whitfield" } });
    const rendered = html
      .replace(/<style[\s\S]*?<\/style>/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, "");

    for (const line of PAGE_LINES.flat().filter(Boolean)) {
      expect(rendered).toContain(line.replace(/\s+/g, ""));
    }
  });

  it("returns a failed parse rather than throwing on bytes that are not a PDF", async () => {
    const parse = await parseUploadedLeasePdfBytes({
      bytes: new TextEncoder().encode("this is not a pdf"),
      fileName: "notes.txt",
      nowIso: "2026-08-01T00:00:00.000Z",
    });
    expect(parse.status).toBe("failed");
    expect(parse.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(parse.review.status).toBe("needs_review");
  });
});
