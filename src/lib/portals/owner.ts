import type { PortalDefinition } from "@/lib/portal-types";

/** Legacy owner role uses the shared property portal navigation. */
export const ownerPortal: PortalDefinition = {
  kind: "owner",
  basePath: "/portal",
  title: "Axis Property Portal",
  accent: "blue",
  sections: [
    { section: "dashboard", label: "Dashboard", tabs: [] },
    { section: "properties", label: "Properties", tabs: [] },
    { section: "applications", label: "Applications", tabs: [] },
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
