import { describe, expect, it } from "vitest";
import {
  NATIVE_BOTTOM_NAV_PRO_MANAGER_ORDER,
  NATIVE_BOTTOM_NAV_RESIDENT_ORDER,
  orderNativeBottomNavItems,
  pickNativeBottomNavItems,
  splitNativeBottomNavItems,
} from "@/lib/native/portal-bottom-nav";
import { adminPortal } from "@/lib/portals/admin";
import { proPortal } from "@/lib/portals/pro";
import {
  RESIDENT_APPROVED_PORTAL_SECTIONS,
  RESIDENT_LIMITED_PORTAL_SECTIONS,
} from "@/lib/portals/resident-sections";

function sectionIds(sections: { section: string }[]): string[] {
  return sections.map((s) => s.section);
}

describe("orderNativeBottomNavItems", () => {
  it("preserves pro registry order with feedback after co-managers", () => {
    const items = proPortal.sections.map((s) => ({ section: s.section, label: s.label }));
    const ordered = orderNativeBottomNavItems(items, "pro").map((item) => item.section);
    expect(ordered).toEqual(sectionIds(proPortal.sections));
    expect(ordered.indexOf("relationships")).toBeLessThan(ordered.indexOf("bugs-feedback"));
    expect(ordered.at(-1)).toBe("profile");
  });

  it("matches exported pro manager tab order through feedback", () => {
    const items = proPortal.sections.map((s) => ({ section: s.section, label: s.label }));
    const ordered = orderNativeBottomNavItems(items, "pro").map((item) => item.section);
    expect(ordered.slice(0, NATIVE_BOTTOM_NAV_PRO_MANAGER_ORDER.length)).toEqual([
      ...NATIVE_BOTTOM_NAV_PRO_MANAGER_ORDER,
    ]);
  });

  it("pins Settings to the end when it is not already last", () => {
    const items = [
      { section: "profile", label: "Settings" },
      { section: "dashboard", label: "Dashboard" },
      { section: "leases", label: "Leases" },
    ];
    expect(pickNativeBottomNavItems(items, "pro").map((item) => item.section)).toEqual([
      "dashboard",
      "leases",
      "profile",
    ]);
  });

  it("preserves resident approved registry order (property-management pattern)", () => {
    const items = RESIDENT_APPROVED_PORTAL_SECTIONS.map((s) => ({ section: s.section, label: s.label }));
    const ordered = orderNativeBottomNavItems(items, "resident").map((item) => item.section);
    expect(ordered).toEqual(sectionIds(RESIDENT_APPROVED_PORTAL_SECTIONS));
    expect(ordered.indexOf("move-in")).toBeLessThan(ordered.indexOf("services"));
    expect(ordered.slice(0, NATIVE_BOTTOM_NAV_RESIDENT_ORDER.length)).toEqual([
      ...NATIVE_BOTTOM_NAV_RESIDENT_ORDER,
    ]);
  });

  it("preserves resident limited registry order", () => {
    const items = RESIDENT_LIMITED_PORTAL_SECTIONS.map((s) => ({ section: s.section, label: s.label }));
    const ordered = orderNativeBottomNavItems(items, "resident").map((item) => item.section);
    expect(ordered).toEqual(sectionIds(RESIDENT_LIMITED_PORTAL_SECTIONS));
  });

  it("preserves admin registry order", () => {
    const items = adminPortal.sections.map((s) => ({ section: s.section, label: s.label }));
    const ordered = orderNativeBottomNavItems(items, "admin").map((item) => item.section);
    expect(ordered).toEqual(sectionIds(adminPortal.sections));
    expect(ordered.at(-1)).toBe("profile");
  });
});

describe("splitNativeBottomNavItems", () => {
  it("returns every section in the scrollable bar with no overflow bucket", () => {
    const items = proPortal.sections.map((s) => ({ section: s.section, label: s.label }));
    const { primary, overflow } = splitNativeBottomNavItems(items, "pro");
    expect(overflow).toEqual([]);
    expect(primary.map((item) => item.section)).toEqual(orderNativeBottomNavItems(items, "pro").map((item) => item.section));
    expect(primary.at(-1)?.section).toBe("profile");
  });

  it("includes all resident limited sections in the scroll strip", () => {
    const items = RESIDENT_LIMITED_PORTAL_SECTIONS.map((s) => ({ section: s.section, label: s.label }));
    const { primary, overflow } = splitNativeBottomNavItems(items, "resident");
    expect(overflow).toEqual([]);
    expect(new Set(primary.map((item) => item.section))).toEqual(new Set(items.map((item) => item.section)));
  });

  it("includes all resident approved sections in the scroll strip", () => {
    const items = RESIDENT_APPROVED_PORTAL_SECTIONS.map((s) => ({ section: s.section, label: s.label }));
    const { primary, overflow } = splitNativeBottomNavItems(items, "resident");
    expect(overflow).toEqual([]);
    expect(primary.map((item) => item.section)).toContain("services");
  });

  it("includes every admin section in the scroll strip", () => {
    const items = adminPortal.sections.map((s) => ({ section: s.section, label: s.label }));
    const { primary, overflow } = splitNativeBottomNavItems(items, "admin");
    expect(overflow).toEqual([]);
    expect(primary.at(-1)?.section).toBe("profile");
  });
});
