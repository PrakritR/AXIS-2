import { describe, expect, it } from "vitest";
import { mergeMonthlyProfit, parseMoneyLabel } from "@/lib/portal-monthly-profit";

describe("portal-monthly-profit", () => {
  it("merges payments and expenses into monthly profit", () => {
    const payments = [
      { key: "2026-01", label: "Jan", value: 1000 },
      { key: "2026-02", label: "Feb", value: 500 },
    ];
    const expenses = [
      { key: "2026-01", label: "Jan", value: 200 },
      { key: "2026-02", label: "Feb", value: 800 },
    ];
    expect(mergeMonthlyProfit(payments, expenses)).toEqual([
      { key: "2026-01", label: "Jan", profit: 800 },
      { key: "2026-02", label: "Feb", profit: -300 },
    ]);
  });

  it("parses currency labels", () => {
    expect(parseMoneyLabel("$1,234.56")).toBe(1234.56);
  });
});
