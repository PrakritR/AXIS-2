import type { PortalDefinition } from "@/lib/portal-types";

export const managerPortal: PortalDefinition = {
  kind: "manager",
  basePath: "/manager",
  title: "Manager portal",
  accent: "blue",
  sections: [
    { section: "dashboard", label: "Dashboard", tabs: [] },
    { section: "properties", label: "Properties", tabs: [] },
    { section: "applications", label: "Applications", tabs: [] },
    { section: "leases", label: "Leases", tabs: [] },
    { section: "work-orders", label: "Work orders", tabs: [] },
    { section: "owners", label: "Owners", tabs: [] },
    { section: "calendar", label: "Calendar", tabs: [] },
    { section: "inbox", label: "Inbox", tabs: [] },
    { section: "profile", label: "Profile", tabs: [] },
  ],
};
