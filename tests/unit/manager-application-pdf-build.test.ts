import { describe, expect, it } from "vitest";
import type { DemoApplicantRow } from "@/data/demo-portal";
import { buildApplicationHtml } from "@/lib/manager-application-html";
import { buildApplicationPdf } from "@/lib/manager-application-pdf";

function shortTermRow(overrides: Partial<DemoApplicantRow> = {}): DemoApplicantRow {
  return {
    id: "PROPLANE-TEST01",
    name: "SIVA NARENDRA CHERUKU",
    email: "siva@example.com",
    bucket: "approved",
    property: "4709A 8th Ave NE",
    propertyId: "prop-1",
    stage: "Room 7",
    detail: "",
    application: {
      rentalType: "short_term",
      fullLegalName: "SIVA NARENDRA CHERUKU",
      email: "siva@example.com",
      phone: "(206) 555-0133",
      leaseTerm: "1 week",
      leaseStart: "2026-08-01",
      leaseEnd: "2026-08-08",
      shortTermCheckInTime: "3:00 PM",
      shortTermCheckOutTime: "11:00 AM",
      roomChoice1: "room-7",
      consentTruth: true,
      shortTermRulesAck: true,
      digitalSignature: "SIVA NARENDRA CHERUKU",
      dateSigned: "2026-07-20",
      customFieldAnswers: [],
    },
    ...overrides,
  };
}

describe("buildApplicationPdf", () => {
  it("builds a PDF for a short-term stay application", async () => {
    const pdf = await buildApplicationPdf(shortTermRow(), { roomLabel: "Room 7" });
    expect(pdf.byteLength).toBeGreaterThan(1000);
    expect(String.fromCharCode(...pdf.slice(0, 4))).toBe("%PDF");
  });

  it("builds a PDF when custom answers use photos/file types", async () => {
    const row = shortTermRow();
    row.application!.customFieldAnswers = [
      {
        key: "pet-photo",
        label: "Pet photo",
        type: "photos",
        value: "attached",
      },
      {
        key: "extra-doc",
        label: "Extra document",
        type: "file",
        value: "paystub.pdf",
      },
    ];
    const pdf = await buildApplicationPdf(row, { roomLabel: "Room 7" });
    expect(String.fromCharCode(...pdf.slice(0, 4))).toBe("%PDF");
  });

  it("renders short-term stay fields in the HTML document view", () => {
    const html = buildApplicationHtml(shortTermRow(), { roomLabel: "Room 7" });
    expect(html).toContain("SHORT-TERM STAY APPLICATION");
    expect(html).toContain("Check-in time");
    expect(html).toContain("3:00 PM");
    expect(html).toContain("House rules acknowledged");
  });
});
