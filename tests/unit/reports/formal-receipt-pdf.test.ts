import { describe, expect, it } from "vitest";
import { buildRentReceiptPdf } from "@/lib/reports/export/formal/rent-receipt-pdf";
import type { RentReceiptDocument } from "@/lib/reports/formal-documents/spec";

describe("formal rent receipt pdf", () => {
  it("generates a non-empty PDF buffer", async () => {
    const doc: RentReceiptDocument = {
      id: "le-1",
      receiptNumber: "RR-LE1",
      issueDate: "2026-06-01",
      landlordName: "Jane Manager",
      landlordAddress: "123 Main St",
      tenantName: "Resident A",
      tenantEmail: "a@test.com",
      propertyLabel: "Pioneer House",
      unitLabel: "Room A",
      propertyAddress: "Pioneer House",
      paymentDate: "2026-05-01",
      amount: "$875.00",
      paymentMethod: "Online (Stripe)",
      periodCovered: "May rent",
      category: "Rent Income",
    };
    const pdf = await buildRentReceiptPdf(doc);
    expect(pdf.byteLength).toBeGreaterThan(500);
    expect(String.fromCharCode(...pdf.slice(0, 4))).toBe("%PDF");
  });
});
