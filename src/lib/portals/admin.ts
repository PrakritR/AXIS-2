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
    { section: "bugs-feedback", label: "Feedback", tabs: [] },
    { section: "profile", label: "Settings", tabs: [] },
  ],
};

/** Default smoke-test paths for web + native WebView (admin portal). */
export const ADMIN_PORTAL_SMOKE_PATHS = [
  { label: "Dashboard", path: "/admin/dashboard" },
  { label: "Onboard", path: "/admin/onboard" },
  { label: "Properties", path: "/admin/properties" },
  { label: "Accounts", path: "/admin/axis-users" },
  { label: "Leases", path: "/admin/leases" },
  { label: "Meetings", path: "/admin/events" },
  { label: "Inbox", path: "/admin/inbox/unopened" },
  { label: "Feedback", path: "/admin/bugs-feedback" },
  { label: "Settings", path: "/admin/profile" },
] as const;
