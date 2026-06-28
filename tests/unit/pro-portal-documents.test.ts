import { describe, expect, it } from "vitest";
import { FREE_SUBSCRIPTION_SECTIONS, managerSectionAllowedForTier } from "@/lib/manager-access";
import { proPortal } from "@/lib/portals/pro";

describe("pro portal documents section", () => {
  it("includes documents and finances nav sections", () => {
    const sections = proPortal.sections.map((s) => s.section);
    expect(sections).toContain("documents");
    expect(sections).toContain("financials");
  });

  it("documents tabs are income/expense docs, 1099, and tax summary", () => {
    const documents = proPortal.sections.find((s) => s.section === "documents");
    expect(documents?.tabs.map((t) => t.id)).toEqual([
      "income-documents",
      "expense-documents",
      "1099",
      "tax-summary",
    ]);
  });

  it("finances tabs are income and expenses", () => {
    const financials = proPortal.sections.find((s) => s.section === "financials");
    expect(financials?.label).toBe("Finances");
    expect(financials?.tabs.map((t) => t.id)).toEqual(["income", "expenses"]);
  });

  it("orders feedback before profile and documents/finances before co-managers", () => {
    const sections = proPortal.sections.map((s) => s.section);
    expect(sections.indexOf("bugs-feedback")).toBeGreaterThan(sections.indexOf("relationships"));
    expect(sections.indexOf("profile")).toBe(sections.indexOf("bugs-feedback") + 1);
    expect(sections.indexOf("documents")).toBeGreaterThan(sections.indexOf("inbox"));
    expect(sections.indexOf("financials")).toBe(sections.indexOf("documents") + 1);
    expect(sections.indexOf("relationships")).toBe(sections.indexOf("financials") + 1);
  });

  it("services tabs are requests, work orders, and vendors", () => {
    const services = proPortal.sections.find((s) => s.section === "services");
    expect(services?.tabs.map((t) => t.id)).toEqual(["requests", "work-orders", "vendors"]);
  });

  it("locks documents and financials for free tier", () => {
    expect(managerSectionAllowedForTier("documents", "free")).toBe(false);
    expect(managerSectionAllowedForTier("financials", "free")).toBe(false);
    expect(managerSectionAllowedForTier("documents", "paid")).toBe(true);
    expect(managerSectionAllowedForTier("financials", "paid")).toBe(true);
  });

  it("marks paid-only sections tierLocked for free users", () => {
    const locked = proPortal.sections
      .filter((s) => !FREE_SUBSCRIPTION_SECTIONS.has(s.section))
      .map((s) => s.section);
    expect(locked).toContain("documents");
    expect(locked).toContain("financials");
    expect(locked).not.toContain("properties");
  });
});
