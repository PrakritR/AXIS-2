import { describe, expect, it } from "vitest";
import {
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

describe("orderNativeBottomNavItems", () => {
  it("preserves input order when Settings is already last", () => {
    const items = [
      { section: "dashboard", label: "Dashboard" },
      { section: "applications", label: "Applications" },
      { section: "payments", label: "Payments" },
      { section: "inbox", label: "Inbox" },
      { section: "documents", label: "Documents" },
      { section: "profile", label: "Settings" },
    ];
    expect(orderNativeBottomNavItems(items, "resident").map((item) => item.section)).toEqual([
      "dashboard",
      "applications",
      "payments",
      "inbox",
      "documents",
      "profile",
    ]);
  });

  it("splits primary strip and overflow for the More sheet", () => {
    const items = [
      { section: "dashboard", label: "Dashboard" },
      { section: "applications", label: "Applications" },
      { section: "payments", label: "Payments" },
      { section: "inbox", label: "Inbox" },
      { section: "documents", label: "Documents" },
      { section: "profile", label: "Settings" },
    ];
    const { primary, overflow } = splitNativeBottomNavItems(items, "resident");
    expect(primary.map((item) => item.section)).toEqual([
      "dashboard",
      "applications",
      "payments",
      "inbox",
      "documents",
    ]);
    expect(overflow.map((item) => item.section)).toEqual(["profile"]);
  });

  it("overflows manager sections beyond the primary limit", () => {
    const items = proPortal.sections.map((s) => ({ section: s.section, label: s.label }));
    const { primary, overflow } = splitNativeBottomNavItems(items, "pro");
    expect(primary.length).toBe(5);
    expect(overflow.length).toBeGreaterThan(0);
    expect(overflow.some((item) => item.section === "profile")).toBe(true);
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

  it("matches pro portal registry order", () => {
    const items = proPortal.sections.map((s) => ({ section: s.section, label: s.label }));
    expect(orderNativeBottomNavItems(items, "pro").map((item) => item.section)).toEqual(
      proPortal.sections.map((s) => s.section),
    );
  });

  it("matches admin portal registry order", () => {
    const items = adminPortal.sections.map((s) => ({ section: s.section, label: s.label }));
    expect(orderNativeBottomNavItems(items, "admin").map((item) => item.section)).toEqual(
      adminPortal.sections.map((s) => s.section),
    );
  });

  it("matches resident limited registry order", () => {
    const items = RESIDENT_LIMITED_PORTAL_SECTIONS.map((s) => ({ section: s.section, label: s.label }));
    expect(orderNativeBottomNavItems(items, "resident").map((item) => item.section)).toEqual(
      RESIDENT_LIMITED_PORTAL_SECTIONS.map((s) => s.section),
    );
  });

  it("matches resident approved registry order", () => {
    const items = RESIDENT_APPROVED_PORTAL_SECTIONS.map((s) => ({ section: s.section, label: s.label }));
    expect(orderNativeBottomNavItems(items, "resident").map((item) => item.section)).toEqual(
      RESIDENT_APPROVED_PORTAL_SECTIONS.map((s) => s.section),
    );
  });
});
