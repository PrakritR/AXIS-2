import type { PortalDefinition } from "@/lib/portal-types";

/** Admin shell aligned with marketing chrome: slim nav, no announcements. */
export const adminPortal: PortalDefinition = {
  kind: "admin",
  basePath: "/admin",
  title: "Admin portal",
  accent: "blue",
  sections: [
    { section: "dashboard", label: "Dashboard", tabs: [] },
    {
      section: "properties",
      label: "Properties",
      tabs: [
        { id: "pending-review", label: "Pending review" },
        { id: "request-change", label: "Request change" },
        { id: "listed", label: "Listed" },
        { id: "unlisted", label: "Unlisted" },
        { id: "rejected", label: "Rejected" },
      ],
    },
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
