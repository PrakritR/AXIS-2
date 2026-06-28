import { describe, expect, it } from "vitest";
import { categoryCodeForChargeKind, chartAccountLabel } from "@/lib/reports/categories";
import { centsToUsd, dollarsToCents } from "@/lib/reports/money";
import { reportToCsv } from "@/lib/reports/export/csv";
import type { ReportResult } from "@/lib/reports/types";

describe("reports/money", () => {
  it("converts dollars to cents", () => {
    expect(dollarsToCents("$12.34")).toBe(1234);
    expect(centsToUsd(1234)).toBe("$12.34");
  });
});

describe("reports/categories", () => {
  it("maps rent kinds to rent_income", () => {
    expect(categoryCodeForChargeKind("rent")).toBe("rent_income");
    expect(categoryCodeForChargeKind("late_fee")).toBe("late_fees");
    expect(chartAccountLabel("maintenance")).toBe("Maintenance");
  });
});

describe("reports/export/csv", () => {
  it("renders header and totals", () => {
    const report: ReportResult = {
      id: "test",
      title: "Test",
      columns: [
        { key: "a", label: "A" },
        { key: "b", label: "B" },
      ],
      rows: [{ a: "1", b: "2" }],
      totals: { a: "Total", b: "2" },
    };
    const csv = reportToCsv(report);
    expect(csv).toContain("A,B");
    expect(csv).toContain("1,2");
    expect(csv).toContain("Total,2");
  });
});
