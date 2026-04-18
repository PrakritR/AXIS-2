import type { PortalDefinition } from "@/lib/portal-types";

/** Owner portal: same operational areas as manager for linked properties only, minus inbox/calendar; adds Managers. */
export const ownerPortal: PortalDefinition = {
  kind: "owner",
  basePath: "/owner",
  title: "Owner portal",
  accent: "blue",
  sections: [
    { section: "dashboard", label: "Dashboard", tabs: [] },
    { section: "properties", label: "Properties", tabs: [] },
    { section: "applications", label: "Applications", tabs: [] },
    { section: "leases", label: "Leases", tabs: [] },
    { section: "payments", label: "Payments", tabs: [] },
    { section: "work-orders", label: "Work orders", tabs: [] },
    { section: "managers", label: "Managers", tabs: [] },
    { section: "profile", label: "Profile", tabs: [] },
  ],
};
