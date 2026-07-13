import type { PortalDefinition } from "@/lib/portal-types";

/** Owner workspace — a property owner's read view of their portfolio: statements, distributions, and messages from their manager. */
export const ownerPortal: PortalDefinition = {
  kind: "owner",
  basePath: "/owner",
  title: "Axis Owner",
  accent: "blue",
  sections: [
    { section: "dashboard", label: "Dashboard", tabs: [] },
    { section: "properties", label: "Properties", tabs: [] },
    { section: "statements", label: "Statements", tabs: [] },
    {
      section: "documents",
      label: "Documents",
      tabs: [],
    },
    {
      section: "inbox",
      label: "Inbox",
      tabs: [
        { id: "unopened", label: "Unopened" },
        { id: "opened", label: "Opened" },
        { id: "sent", label: "Sent" },
        { id: "trash", label: "Trash" },
        { id: "notifications", label: "Notifications" },
      ],
    },
    { section: "profile", label: "Settings", tabs: [] },
  ],
};

/** Default smoke-test paths for web + native WebView (owner portal). */
export const OWNER_PORTAL_SMOKE_PATHS = [
  { label: "Dashboard", path: "/owner/dashboard" },
  { label: "Properties", path: "/owner/properties" },
  { label: "Statements", path: "/owner/statements" },
  { label: "Documents", path: "/owner/documents" },
  { label: "Inbox", path: "/owner/inbox/unopened" },
  { label: "Settings", path: "/owner/profile" },
] as const;
