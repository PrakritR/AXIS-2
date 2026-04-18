import type { PortalDefinition } from "@/lib/portal-types";

/** Admin portal navigation (minimal shell; no announcement banner). */
export const adminPortal: PortalDefinition = {
  kind: "admin",
  basePath: "/admin",
  title: "Admin portal",
  accent: "blue",
  sections: [
    { section: "dashboard", label: "Dashboard", tabs: [] },
    { section: "properties", label: "Properties", tabs: [] },
    { section: "applications", label: "Applications", tabs: [] },
    { section: "managers", label: "Managers", tabs: [] },
    {
      section: "leases",
      label: "Leases",
      tabs: [
        { id: "manager-review", label: "Manager review" },
        { id: "admin-review", label: "Admin review" },
        { id: "with-resident", label: "With resident" },
        { id: "signed", label: "Signed" },
      ],
    },
    {
      section: "calendar",
      label: "Calendar",
      tabs: [
        { id: "week", label: "Week view" },
        { id: "availability", label: "Availability" },
      ],
    },
    { section: "payments", label: "Payments", tabs: [] },
    { section: "work-orders", label: "Work orders", tabs: [] },
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
