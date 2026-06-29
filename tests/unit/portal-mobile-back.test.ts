import { describe, expect, it } from "vitest";
import { resolvePortalMobileBackTarget } from "@/lib/portal-mobile-back";
import type { PortalDefinition } from "@/lib/portal-types";

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
