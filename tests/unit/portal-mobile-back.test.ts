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
      section: "communication",
      label: "Communication",
      tabs: [
        { id: "unopened", label: "Unopened" },
        { id: "sent", label: "Sent" },
      ],
    },
    { section: "profile", label: "Settings", tabs: [] },
  ],
};

const managerPortal: PortalDefinition = {
  kind: "manager",
  basePath: "/portal",
  title: "Manager Portal",
  accent: "blue",
  sections: [
    { section: "dashboard", label: "Dashboard", tabs: [] },
    { section: "communication", label: "Communication", tabs: [] },
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

  it("hides dashboard back on early rental-application wizard steps", () => {
    const params = new URLSearchParams({ wizardStep: "2" });
    expect(resolvePortalMobileBackTarget("/resident/applications/apply", residentPortal, params)).toBeNull();
  });

  it("returns dashboard from apply after step 3", () => {
    const params = new URLSearchParams({ wizardStep: "4" });
    expect(resolvePortalMobileBackTarget("/resident/applications/apply", residentPortal, params)).toEqual({
      href: "/resident/dashboard",
      label: "Dashboard",
    });
  });

  it("returns first communication email tab from a deeper email tab", () => {
    expect(resolvePortalMobileBackTarget("/resident/communication/email/sent", residentPortal)).toEqual({
      href: "/resident/communication/email/unopened",
      label: "Communication",
    });
  });

  it("returns dashboard from the default communication email tab", () => {
    expect(resolvePortalMobileBackTarget("/resident/communication/email/unopened", residentPortal)).toEqual({
      href: "/resident/dashboard",
      label: "Dashboard",
    });
  });

  it("returns sms all view from deeper resident sms bucket", () => {
    expect(resolvePortalMobileBackTarget("/resident/communication/sms/sent", residentPortal)).toEqual({
      href: "/resident/communication/sms/all",
      label: "Communication",
    });
  });

  it("returns sms all view from deeper manager sms bucket", () => {
    expect(resolvePortalMobileBackTarget("/portal/communication/sms/opened", managerPortal)).toEqual({
      href: "/portal/communication/sms/all",
      label: "Communication",
    });
  });

  it("returns dashboard from communication sms all view", () => {
    expect(resolvePortalMobileBackTarget("/portal/communication/sms/all", managerPortal)).toEqual({
      href: "/portal/dashboard",
      label: "Dashboard",
    });
  });

  it("returns dashboard from legacy communication sms unopened bucket", () => {
    expect(resolvePortalMobileBackTarget("/portal/communication/sms/unopened", managerPortal)).toEqual({
      href: "/portal/dashboard",
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
