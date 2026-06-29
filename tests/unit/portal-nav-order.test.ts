import { describe, expect, it } from "vitest";
import { FREE_SUBSCRIPTION_SECTIONS, managerSectionAllowedForTier } from "@/lib/manager-access";
import { orderNativeBottomNavItems } from "@/lib/native/portal-bottom-nav";
import { adminPortal } from "@/lib/portals/admin";
import { proPortal } from "@/lib/portals/pro";
import {
  RESIDENT_APPROVED_PORTAL_SECTIONS,
  RESIDENT_FREE_TIER_SECTION_IDS,
  RESIDENT_LIMITED_PORTAL_SECTIONS,
} from "@/lib/portals/resident-sections";

function sectionIds(sections: { section: string }[]): string[] {
  return sections.map((s) => s.section);
}

function expectContiguousBlock(sections: string[], block: string[], anchorAfter: string, anchorBefore: string) {
  const afterIdx = sections.indexOf(anchorAfter);
  const beforeIdx = sections.indexOf(anchorBefore);
  expect(afterIdx).toBeGreaterThanOrEqual(0);
  expect(beforeIdx).toBeGreaterThan(afterIdx);
  const slice = sections.slice(afterIdx + 1, beforeIdx);
  expect(slice).toEqual(block);
}

describe("portal nav order parity (web registry = native bottom bar)", () => {
  it("pro native order matches pro registry", () => {
    const items = proPortal.sections.map((s) => ({ section: s.section, label: s.label }));
    expect(sectionIds(orderNativeBottomNavItems(items, "pro"))).toEqual(sectionIds(proPortal.sections));
  });

  it("admin native order matches admin registry", () => {
    const items = adminPortal.sections.map((s) => ({ section: s.section, label: s.label }));
    expect(sectionIds(orderNativeBottomNavItems(items, "admin"))).toEqual(sectionIds(adminPortal.sections));
  });

  it("resident limited native order matches registry", () => {
    const items = RESIDENT_LIMITED_PORTAL_SECTIONS.map((s) => ({ section: s.section, label: s.label }));
    expect(sectionIds(orderNativeBottomNavItems(items, "resident"))).toEqual(
      sectionIds(RESIDENT_LIMITED_PORTAL_SECTIONS),
    );
  });

  it("resident approved native order matches registry", () => {
    const items = RESIDENT_APPROVED_PORTAL_SECTIONS.map((s) => ({ section: s.section, label: s.label }));
    expect(sectionIds(orderNativeBottomNavItems(items, "resident"))).toEqual(
      sectionIds(RESIDENT_APPROVED_PORTAL_SECTIONS),
    );
  });
});

describe("pro portal nav grouping (free → paid block → account → settings)", () => {
  const sections = sectionIds(proPortal.sections);
  const paidBlock = [
    "residents",
    "leases",
    "services",
    "inbox",
    "documents",
    "financials",
    "relationships",
  ];

  it("places payments before the paid block", () => {
    expect(sections.indexOf("payments")).toBeLessThan(sections.indexOf("residents"));
  });

  it("groups paid sections contiguously between payments and plan", () => {
    expectContiguousBlock(sections, paidBlock, "payments", "plan");
  });

  it("ends with plan, feedback, and settings", () => {
    expect(sections.slice(-3)).toEqual(["plan", "bugs-feedback", "profile"]);
  });

  it("free operational sections precede the paid block", () => {
    expect(sections.slice(0, 5)).toEqual(["dashboard", "properties", "calendar", "applications", "payments"]);
  });
});

describe("resident portal nav grouping", () => {
  const freeIds = new Set<string>(RESIDENT_FREE_TIER_SECTION_IDS);

  it("limited: groups locked sections between move-in and feedback", () => {
    const sections = sectionIds(RESIDENT_LIMITED_PORTAL_SECTIONS);
    expectContiguousBlock(sections, ["inbox", "documents", "financials"], "move-in", "bugs-feedback");
    for (const id of ["inbox", "documents", "financials"]) {
      expect(freeIds.has(id)).toBe(false);
    }
  });

  it("approved: groups locked sections between move-in and feedback", () => {
    const sections = sectionIds(RESIDENT_APPROVED_PORTAL_SECTIONS);
    expectContiguousBlock(sections, ["services", "inbox", "documents", "financials"], "move-in", "bugs-feedback");
  });
});

describe("pro portal documents section", () => {
  it("includes documents and finances nav sections", () => {
    const sections = sectionIds(proPortal.sections);
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
