import { describe, expect, it } from "vitest";
import { buildDepositDispositionPdf } from "@/lib/reports/export/formal/deposit-disposition-pdf";
import { buildOwnerStatementPdf } from "@/lib/reports/export/formal/owner-statement-pdf";

describe("formal owner statement pdf", () => {
  it("generates a non-empty PDF buffer", async () => {
    const pdf = await buildOwnerStatementPdf({
      issueDate: "2026-07-01",
      periodFrom: "2026-01-01",
      periodTo: "2026-06-30",
      landlordName: "Jane Manager",
      landlordAddress: "123 Main St\nSeattle, WA",
      ownerName: "Property Owner LLC",
      propertyLabel: "Pioneer House",
      lines: [
        { label: "Cash in (collections)", amount: "$12,000.00" },
        { label: "Cash out (expenses paid)", amount: "$2,400.00" },
        { label: "Management fee", amount: "$600.00" },
        { label: "Reserve holdback", amount: "$500.00" },
      ],
      distribution: "$8,500.00",
      billsDue: "$350.00",
    });
    expect(pdf.byteLength).toBeGreaterThan(500);
    expect(String.fromCharCode(...pdf.slice(0, 4))).toBe("%PDF");
  });
});

describe("formal deposit disposition pdf", () => {
  it("generates a non-empty PDF buffer", async () => {
    const pdf = await buildDepositDispositionPdf({
      issueDate: "2026-07-01",
      landlordName: "Jane Manager",
      landlordAddress: "123 Main St",
      residentName: "Resident A",
      residentEmail: "a@test.com",
      propertyLabel: "Pioneer House",
      unitLabel: "Room A",
      depositReceivedDate: "2025-08-01",
      dispositionType: "Itemized partial",
      depositHeld: "$875.00",
      itemization: [{ label: "Carpet cleaning", amount: "$125.00" }],
      totalWithheld: "$125.00",
      refundDue: "$750.00",
    });
    expect(pdf.byteLength).toBeGreaterThan(500);
    expect(String.fromCharCode(...pdf.slice(0, 4))).toBe("%PDF");
  });
});
