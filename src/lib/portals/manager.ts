import type { PortalDefinition } from "@/lib/portal-types";

export const managerPortal: PortalDefinition = {
  kind: "manager",
  basePath: "/manager",
  title: "Manager portal",
  accent: "blue",
  sections: [
    { section: "dashboard", label: "Dashboard", tabs: [] },
    { section: "properties", label: "Properties", tabs: [] },
    { section: "owners", label: "Add owner", tabs: [] },
    { section: "applications", label: "Applications", tabs: [] },
    { section: "leases", label: "Leases", tabs: [] },
    { section: "payments", label: "Payments", tabs: [] },
    { section: "work-orders", label: "Work orders", tabs: [] },
    { section: "calendar", label: "Calendar", tabs: [] },
    { section: "plan", label: "Plan", tabs: [] },
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
    { section: "profile", label: "Profile", tabs: [] },
  ],
};
