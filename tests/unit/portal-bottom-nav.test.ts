import { describe, expect, it } from "vitest";
import {
  orderNativeBottomNavItems,
  pickNativeBottomNavItems,
  splitNativeBottomNavItems,
} from "@/lib/native/portal-bottom-nav";

describe("orderNativeBottomNavItems", () => {
  const items = [
    { section: "dashboard", label: "Dashboard" },
    { section: "applications", label: "Applications" },
    { section: "payments", label: "Payments" },
    { section: "inbox", label: "Inbox" },
    { section: "documents", label: "Documents" },
    { section: "profile", label: "Settings" },
  ];

  it("orders resident tabs with preferred sections first", () => {
    const ordered = orderNativeBottomNavItems(items, "resident");
    expect(ordered.map((item) => item.section)).toEqual([
      "dashboard",
      "applications",
      "payments",
      "inbox",
      "documents",
      "profile",
    ]);
  });

  it("includes every visible section in the native scroll strip", () => {
    const { primary, overflow } = splitNativeBottomNavItems(items, "resident");
    expect(primary.map((item) => item.section)).toEqual([
      "dashboard",
      "applications",
      "payments",
      "inbox",
      "documents",
      "profile",
    ]);
    expect(overflow).toEqual([]);
  });

  it("fills from visible items when preferred tabs are missing", () => {
    const picked = pickNativeBottomNavItems(
      [
        { section: "dashboard", label: "Dashboard" },
        { section: "leases", label: "Leases" },
        { section: "profile", label: "Settings" },
      ],
      "pro",
    );
    expect(picked.map((item) => item.section)).toEqual(["dashboard", "leases", "profile"]);
  });

  it("orders admin tabs with all portal sections", () => {
    const adminItems = [
      { section: "profile", label: "Settings" },
      { section: "dashboard", label: "Dashboard" },
      { section: "leases", label: "Leases" },
      { section: "inbox", label: "Inbox" },
      { section: "onboard", label: "Onboard" },
    ];
    const ordered = orderNativeBottomNavItems(adminItems, "admin");
    expect(ordered.map((item) => item.section)).toEqual([
      "dashboard",
      "onboard",
      "leases",
      "inbox",
      "profile",
    ]);
  });
});
