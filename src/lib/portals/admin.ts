import type { PortalDefinition } from "@/lib/portal-types";

/** Admin portal navigation (minimal shell; no announcement banner). */
export const adminPortal: PortalDefinition = {
  kind: "admin",
  basePath: "/admin",
  title: "Admin Portal",
  accent: "blue",
  sections: [
    { section: "dashboard", label: "Dashboard", tabs: [] },
    { section: "onboard", label: "Onboard", tabs: [] },
    { section: "properties", label: "Properties", tabs: [] },
    { section: "axis-users", label: "Accounts", tabs: [] },
    { section: "leases", label: "Leases", tabs: [] },
    { section: "events", label: "Meetings", tabs: [] },
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
    {
      section: "bugs-feedback",
      label: "Feedback",
      tabs: [
        { id: "bugs", label: "Bugs" },
        { id: "feedback", label: "Feedback" },
      ],
    },
    { section: "profile", label: "Profile", tabs: [] },
  ],
};
