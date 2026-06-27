import { describe, expect, it } from "vitest";
import { applyFormalDocumentScope } from "@/lib/reports/formal-documents/scoped-queries";
import {
  PROPERTY_RENT_RECEIPT_DEFAULT_FIELDS,
  receiptNumberForLedgerEntry,
} from "@/lib/reports/formal-documents/spec";

describe("formal document filters", () => {
  it("resolves portfolio scope by default", () => {
    const filters = applyFormalDocumentScope({ from: "2026-01-01", to: "2026-03-31" });
    expect(filters.scope).toBe("portfolio");
  });

  it("resolves tenant scope from resident email", () => {
    const filters = applyFormalDocumentScope({
      residentEmail: "a@test.com",
      from: "2026-01-01",
      to: "2026-03-31",
    });
    expect(filters.scope).toBe("tenant");
  });

  it("builds deterministic receipt numbers", () => {
    expect(receiptNumberForLedgerEntry("abc12345-uuid")).toBe("RR-ABC12345");
  });

  it("includes days rented and rent collected fields for property rent receipts", () => {
    expect(PROPERTY_RENT_RECEIPT_DEFAULT_FIELDS).toContain("daysRented");
    expect(PROPERTY_RENT_RECEIPT_DEFAULT_FIELDS).toContain("daysAvailable");
    expect(PROPERTY_RENT_RECEIPT_DEFAULT_FIELDS).toContain("amount");
  });
});
