import { describe, expect, it } from "vitest";
import { pickNativeBottomNavItems, splitNativeBottomNavItems } from "@/lib/native/portal-bottom-nav";

describe("pickNativeBottomNavItems", () => {
  const items = [
    { section: "dashboard", label: "Dashboard" },
    { section: "applications", label: "Applications" },
    { section: "payments", label: "Payments" },
    { section: "inbox", label: "Inbox" },
    { section: "documents", label: "Documents" },
    { section: "profile", label: "Settings" },
  ];

  it("prefers resident primary tabs (4 slots)", () => {
    const picked = pickNativeBottomNavItems(items, "resident");
    expect(picked.map((item) => item.section)).toEqual([
      "dashboard",
      "applications",
      "payments",
      "inbox",
    ]);
  });

  it("puts remaining sections in overflow for More menu", () => {
    const { primary, overflow } = splitNativeBottomNavItems(items, "resident");
    expect(primary.map((item) => item.section)).toEqual([
      "dashboard",
      "applications",
      "payments",
      "inbox",
    ]);
    expect(overflow.map((item) => item.section)).toEqual(["documents", "profile"]);
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
});
