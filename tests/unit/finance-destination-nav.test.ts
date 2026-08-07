import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { financeGroupIdForTab } from "@/components/portal/finance-destination-nav";

describe("financeGroupIdForTab", () => {
  it("maps transaction tabs", () => {
    expect(financeGroupIdForTab("income")).toBe("transactions");
    expect(financeGroupIdForTab("expenses")).toBe("transactions");
  });

  it("maps report tabs", () => {
    expect(financeGroupIdForTab("trial-balance")).toBe("reports");
    expect(financeGroupIdForTab("budget-vs-actual")).toBe("reports");
  });

  it("maps operations tabs", () => {
    expect(financeGroupIdForTab("bills")).toBe("operations");
    expect(financeGroupIdForTab("owner-distributions")).toBe("operations");
  });

  it("falls back to transactions for unknown ids", () => {
    expect(financeGroupIdForTab("unknown")).toBe("transactions");
  });
});

describe("FinanceDestinationNav layout", () => {
  it("uses full-width equal tabs like Payments", () => {
    const source = readFileSync(
      join(process.cwd(), "src/components/portal/finance-destination-nav.tsx"),
      "utf8",
    );
    expect(source).toContain('itemLayout="equal"');
    expect(source).toContain("denseEqualRow");
    expect(source).not.toContain("LocalDestinationNav");
    expect(source).not.toContain("SUB_NAV_WRAP_CLASS");
  });

  it("orders group tabs transactions, reports, then operations", () => {
    const source = readFileSync(
      join(process.cwd(), "src/components/portal/finance-destination-nav.tsx"),
      "utf8",
    );
    const transactionsIdx = source.indexOf('id: "transactions"');
    const reportsIdx = source.indexOf('id: "reports"');
    const operationsIdx = source.indexOf('id: "operations"');
    expect(transactionsIdx).toBeGreaterThan(-1);
    expect(reportsIdx).toBeGreaterThan(transactionsIdx);
    expect(operationsIdx).toBeGreaterThan(reportsIdx);
  });
});
