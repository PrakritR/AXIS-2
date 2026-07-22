import { describe, expect, it } from "vitest";
import { buildReceiptRows } from "@/lib/rent-receipts";
import type { ReportRow } from "@/lib/reports/types";

// Regression for the resident Documents › Rent receipts "row does not open
// inline" bug. Reproduced against the real resident ledger, which contains
// payments that are IDENTICAL on (date, amount, description) — two
// application-fee payments of $45 on the same day. The tab tracked the open
// receipt by those three fields, so the duplicates were indistinguishable:
// clicking one row opened both, and clicking its twin toggled the shared value
// off and collapsed everything, leaving an open chevron with no receipt below.
// The fix is a stable per-row id (mirroring the Other-documents table); these
// tests lock that duplicates stay individually addressable.
describe("buildReceiptRows", () => {
  it("gives true-duplicate ledger payments distinct ids so each stays selectable", () => {
    const rows: ReportRow[] = [
      { date: "2026-06-14", description: "Payment — Application fee", charge: "", payment: "$45.00", balance: "$45.00" },
      { date: "2026-06-14", description: "Payment — Application fee", charge: "", payment: "$45.00", balance: "$90.00" },
    ];

    const receipts = buildReceiptRows(rows);

    expect(receipts).toHaveLength(2);
    const ids = receipts.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length); // unique even though the rows are otherwise identical
    // Both duplicates survive with identical presentation — only the id differs.
    expect(receipts.every((r) => r.amount === "$45.00" && r.date === "2026-06-14")).toBe(true);
  });

  it("keeps only payment rows, newest first, with a description fallback", () => {
    const rows: ReportRow[] = [
      { date: "2026-01-01", description: "", charge: "", payment: "$100.00", balance: "$100.00" },
      { date: "2026-02-01", description: "Rent charge", charge: "$100.00", payment: "", balance: "$0.00" }, // charge, not payment
      { date: "2026-03-01", description: "Payment — Rent", charge: "", payment: "$100.00", balance: "$0.00" },
    ];

    const receipts = buildReceiptRows(rows);

    // Charge rows are excluded; payments are returned newest-first.
    expect(receipts.map((r) => r.date)).toEqual(["2026-03-01", "2026-01-01"]);
    // Empty description falls back to a readable label.
    expect(receipts[1]?.description).toBe("Rent payment");
  });
});
