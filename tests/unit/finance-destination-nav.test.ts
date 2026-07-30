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
