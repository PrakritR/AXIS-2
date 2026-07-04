import type { PortalDefinition } from "@/lib/portal-types";

/** Vendor workspace — work orders offered by managers, scheduled visits, and payouts (Phase 3). */
export const vendorPortal: PortalDefinition = {
  kind: "vendor",
  basePath: "/vendor",
  title: "Axis",
  accent: "blue",
  sections: [
    { section: "dashboard", label: "Home", tabs: [] },
    { section: "work-orders", label: "Work Orders", tabs: [] },
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
    { section: "profile", label: "Profile", tabs: [] },
  ],
};

/** Default smoke-test paths for web + native WebView (vendor portal). */
export const VENDOR_PORTAL_SMOKE_PATHS = [
  { label: "Home", path: "/vendor/dashboard" },
  { label: "Work Orders", path: "/vendor/work-orders" },
  { label: "Calendar", path: "/vendor/calendar" },
  { label: "Inbox", path: "/vendor/inbox/unopened" },
  { label: "Profile", path: "/vendor/profile" },
] as const;
