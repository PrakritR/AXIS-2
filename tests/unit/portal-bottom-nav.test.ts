import { describe, expect, it } from "vitest";
import {
  NATIVE_BOTTOM_NAV_ADMIN_PRIMARY,
  NATIVE_BOTTOM_NAV_PRO_MANAGER_ORDER,
  NATIVE_BOTTOM_NAV_PRO_MANAGER_PRIMARY,
  NATIVE_BOTTOM_NAV_RESIDENT_ORDER,
  NATIVE_BOTTOM_NAV_RESIDENT_PRIMARY,
  nativeBottomBarEnabledForKind,
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
  it("curates the pro manager bar to the primary set and overflows the rest", () => {
    const items = proPortal.sections.map((s) => ({ section: s.section, label: s.label }));
    const { primary, overflow } = splitNativeBottomNavItems(items, "pro");
    expect(primary.map((item) => item.section)).toEqual([...NATIVE_BOTTOM_NAV_PRO_MANAGER_PRIMARY]);
    expect(overflow.map((item) => item.section)).toEqual(
      sectionIds(proPortal.sections).filter(
        (section) => !(NATIVE_BOTTOM_NAV_PRO_MANAGER_PRIMARY as readonly string[]).includes(section),
      ),
    );
    expect(overflow.map((item) => item.section)).toContain("calendar");
    expect(overflow.map((item) => item.section)).toContain("services");
    expect(primary.length + overflow.length).toBe(items.length);
  });

  it("curates the resident bar (limited) to the primary set and overflows the rest", () => {
    const items = RESIDENT_LIMITED_PORTAL_SECTIONS.map((s) => ({ section: s.section, label: s.label }));
    const { primary, overflow } = splitNativeBottomNavItems(items, "resident");
    expect(primary.map((item) => item.section)).toEqual([...NATIVE_BOTTOM_NAV_RESIDENT_PRIMARY]);
    expect(primary.length + overflow.length).toBe(items.length);
  });

  it("curates the resident bar (approved) to the primary set and overflows the rest", () => {
    const items = RESIDENT_APPROVED_PORTAL_SECTIONS.map((s) => ({ section: s.section, label: s.label }));
    const { primary, overflow } = splitNativeBottomNavItems(items, "resident");
    expect(primary.map((item) => item.section)).toEqual([...NATIVE_BOTTOM_NAV_RESIDENT_PRIMARY]);
    expect(overflow.map((item) => item.section)).toContain("services");
    expect(primary.length + overflow.length).toBe(items.length);
  });

  it("curates the admin bar to the primary set and overflows the rest", () => {
    const items = adminPortal.sections.map((s) => ({ section: s.section, label: s.label }));
    const { primary, overflow } = splitNativeBottomNavItems(items, "admin");
    expect(primary.map((item) => item.section)).toEqual([...NATIVE_BOTTOM_NAV_ADMIN_PRIMARY]);
    expect(overflow.map((item) => item.section)).toContain("profile");
    expect(primary.length + overflow.length).toBe(items.length);
  });

  it("fails closed (not open) for an unrecognized kind — nothing goes on the fixed bar", () => {
    const items = proPortal.sections.map((s) => ({ section: s.section, label: s.label }));
    // @ts-expect-error deliberately probing an unknown/future role
    const { primary, overflow } = splitNativeBottomNavItems(items, "future-role");
    expect(primary).toEqual([]);
    expect(overflow.length).toBe(items.length);
  });

  it("fails closed for a missing kind too", () => {
    const items = proPortal.sections.map((s) => ({ section: s.section, label: s.label }));
    const { primary, overflow } = splitNativeBottomNavItems(items, undefined);
    expect(primary).toEqual([]);
    expect(overflow.length).toBe(items.length);
  });
});

describe("nativeBottomBarEnabledForKind", () => {
  it("is disabled only for resident — Dashboard is the hub, no fixed tab bar", () => {
    expect(nativeBottomBarEnabledForKind("resident")).toBe(false);
  });

  it("stays enabled for every other role", () => {
    expect(nativeBottomBarEnabledForKind("pro")).toBe(true);
    expect(nativeBottomBarEnabledForKind("manager")).toBe(true);
    expect(nativeBottomBarEnabledForKind("admin")).toBe(true);
    expect(nativeBottomBarEnabledForKind("vendor")).toBe(true);
    expect(nativeBottomBarEnabledForKind(undefined)).toBe(true);
  });
});
