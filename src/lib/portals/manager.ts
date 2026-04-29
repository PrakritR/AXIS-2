import type { PortalDefinition } from "@/lib/portal-types";

export const managerPortal: PortalDefinition = {
  kind: "manager",
  basePath: "/manager",
  title: "Axis Property Portal",
  accent: "blue",
  sections: [
    { section: "dashboard", label: "Dashboard", tabs: [] },
    { section: "properties", label: "Properties", tabs: [] },
    { section: "applications", label: "Applications", tabs: [] },
    { section: "residents", label: "Residents", tabs: [] },
    { section: "leases", label: "Leases", tabs: [] },
    { section: "work-orders", label: "Work orders", tabs: [] },
    { section: "calendar", label: "Calendar", tabs: [] },
    {
      section: "inbox",
      label: "Inbox",
      tabs: [
        { id: "unopened", label: "Unopened" },
        { id: "opened", label: "Opened" },
        { id: "sent", label: "Sent" },
        { id: "trash", label: "Trash" },
      ],
    },
    { section: "plan", label: "Plan", tabs: [] },
    { section: "profile", label: "Profile", tabs: [] },
  ],
};
