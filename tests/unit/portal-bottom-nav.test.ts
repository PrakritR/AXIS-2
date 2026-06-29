import { describe, expect, it } from "vitest";
import { pickNativeBottomNavItems } from "@/lib/native/portal-bottom-nav";

describe("pickNativeBottomNavItems", () => {
  const items = [
    { section: "dashboard", label: "Dashboard" },
    { section: "applications", label: "Applications" },
    { section: "payments", label: "Payments" },
    { section: "inbox", label: "Inbox" },
    { section: "documents", label: "Documents" },
    { section: "profile", label: "Settings" },
  ];

  it("prefers resident primary tabs", () => {
    const picked = pickNativeBottomNavItems(items, "resident");
    expect(picked.map((item) => item.section)).toEqual([
      "dashboard",
      "applications",
      "payments",
      "inbox",
      "profile",
    ]);
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
