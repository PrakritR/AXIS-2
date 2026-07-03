import { describe, expect, it } from "vitest";
import {
  expenseTaxStatusLabel,
  isCategoryDeductible,
  resolveExpenseTaxDeductible,
  SYSTEM_CHART_ACCOUNTS,
} from "@/lib/reports/categories";

describe("expense tax classification", () => {
  it("marks Schedule E expense categories deductible", () => {
    for (const code of ["maintenance", "plumbing", "utilities", "property_tax", "insurance", "other_expense"]) {
      expect(isCategoryDeductible(code)).toBe(true);
    }
  });

  it("marks capital improvements non-deductible", () => {
    expect(isCategoryDeductible("capital_improvement")).toBe(false);
  });

  it("defaults unknown/custom codes to deductible (Sch. E Line 19 Other)", () => {
    expect(isCategoryDeductible("some_custom_code")).toBe(true);
    expect(isCategoryDeductible(null)).toBe(true);
  });

  it("gives every expense account an explicit classification", () => {
    for (const acct of SYSTEM_CHART_ACCOUNTS) {
      if (acct.accountType === "expense") {
        expect(typeof acct.deductible, `deductible missing on ${acct.code}`).toBe("boolean");
      }
    }
  });

  it("prefers the stored per-expense override over the category rule", () => {
    expect(resolveExpenseTaxDeductible("maintenance", false)).toBe(false);
    expect(resolveExpenseTaxDeductible("capital_improvement", true)).toBe(true);
    expect(resolveExpenseTaxDeductible("maintenance", null)).toBe(true);
    expect(resolveExpenseTaxDeductible("capital_improvement", undefined)).toBe(false);
  });

  it("labels the two states", () => {
    expect(expenseTaxStatusLabel(true)).toBe("Deductible");
    expect(expenseTaxStatusLabel(false)).toBe("Non-deductible");
  });
});
