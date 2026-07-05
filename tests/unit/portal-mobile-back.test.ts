import { describe, expect, it } from "vitest";
import { portalDashboardMobileHeaderLabel, resolvePortalMobileBackTarget } from "@/lib/portal-mobile-back";
import type { PortalDefinition } from "@/lib/portal-types";
import { vendorPortal } from "@/lib/portals/vendor";

const residentPortal: PortalDefinition = {
  kind: "resident",
  basePath: "/resident",
  title: "Resident Portal",
  accent: "blue",
  sections: [
    { section: "dashboard", label: "Dashboard", tabs: [] },
    { section: "applications", label: "Applications", tabs: [] },
    {
      section: "inbox",
      label: "Inbox",
      tabs: [
        { id: "unopened", label: "Unopened" },
        { id: "sent", label: "Sent" },
      ],
    },
    { section: "profile", label: "Settings", tabs: [] },
  ],
};

describe("resolvePortalMobileBackTarget", () => {
  it("returns null on dashboard", () => {
    expect(resolvePortalMobileBackTarget("/resident/dashboard", residentPortal)).toBeNull();
  });

  it("returns dashboard from a top-level section", () => {
    expect(resolvePortalMobileBackTarget("/resident/applications", residentPortal)).toEqual({
      href: "/resident/dashboard",
      label: "Dashboard",
    });
  });

  it("returns first inbox tab from a deeper inbox tab", () => {
    expect(resolvePortalMobileBackTarget("/resident/inbox/sent", residentPortal)).toEqual({
      href: "/resident/inbox/unopened",
      label: "Inbox",
    });
  });

  it("returns dashboard from the default inbox tab", () => {
    expect(resolvePortalMobileBackTarget("/resident/inbox/unopened", residentPortal)).toEqual({
      href: "/resident/dashboard",
      label: "Dashboard",
    });
  });
});

describe("portalDashboardMobileHeaderLabel", () => {
  it("returns the dashboard label on the dashboard route", () => {
    expect(portalDashboardMobileHeaderLabel("/resident/dashboard", residentPortal)).toBe("Dashboard");
  });

  it("returns null on a non-dashboard section", () => {
    expect(portalDashboardMobileHeaderLabel("/resident/applications", residentPortal)).toBeNull();
  });

  it("returns null outside the portal's basePath", () => {
    expect(portalDashboardMobileHeaderLabel("/manager/dashboard", residentPortal)).toBeNull();
  });

  it("returns Dashboard for vendor portal dashboard route", () => {
    expect(portalDashboardMobileHeaderLabel("/vendor/dashboard", vendorPortal)).toBe("Dashboard");
  });
});
