import { describe, expect, it } from "vitest";
import { FREE_SUBSCRIPTION_SECTIONS, managerSectionAllowedForTier } from "@/lib/manager-access";
import { proPortal } from "@/lib/portals/pro";

describe("pro portal documents section", () => {
  it("uses documents instead of financials in nav", () => {
    const sections = proPortal.sections.map((s) => s.section);
    expect(sections).toContain("documents");
    expect(sections).not.toContain("financials");
  });

  it("includes tax-focused document tabs", () => {
    const documents = proPortal.sections.find((s) => s.section === "documents");
    expect(documents?.label).toBe("Documents");
    expect(documents?.tabs.map((t) => t.id)).toEqual([
      "summary",
      "rent-receipts",
      "expenses",
      "rental-days",
      "profit-loss",
      "1099",
    ]);
  });

  it("locks documents for free tier but keeps tab visible in definition", () => {
    expect(managerSectionAllowedForTier("documents", "free")).toBe(false);
    expect(managerSectionAllowedForTier("documents", "paid")).toBe(true);
    expect(proPortal.sections.some((s) => s.section === "documents")).toBe(true);
  });

  it("marks paid-only sections tierLocked for free users", () => {
    const locked = proPortal.sections
      .filter((s) => !FREE_SUBSCRIPTION_SECTIONS.has(s.section))
      .map((s) => s.section);
    expect(locked).toContain("documents");
    expect(locked).toContain("residents");
    expect(locked).not.toContain("properties");
  });
});
