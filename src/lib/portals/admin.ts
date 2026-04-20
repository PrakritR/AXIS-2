import type { PortalDefinition } from "@/lib/portal-types";

/** Admin portal navigation (minimal shell; no announcement banner). */
export const adminPortal: PortalDefinition = {
  kind: "admin",
  basePath: "/admin",
  title: "Admin portal",
  accent: "blue",
  sections: [
    { section: "dashboard", label: "Dashboard", tabs: [] },
    { section: "create-manager", label: "Create manager", tabs: [] },
    { section: "create-resident", label: "Create resident", tabs: [] },
    { section: "properties", label: "Properties", tabs: [] },
    { section: "managers", label: "Managers", tabs: [] },
    { section: "owners", label: "Owners", tabs: [] },
    { section: "leases", label: "Leases", tabs: [] },
    {
      section: "events",
      label: "Events",
      tabs: [
        { id: "events", label: "Events" },
        { id: "availability", label: "Availability" },
      ],
    },
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
