import type { PortalDefinition } from "@/lib/portal-types";

/** Unified property workspace — managers, owners, and paid workspace users share one portal. */
export const proPortal: PortalDefinition = {
  kind: "pro",
  basePath: "/portal",
  title: "Axis Property Portal",
  accent: "blue",
  sections: [
    { section: "dashboard", label: "Dashboard", tabs: [] },
    { section: "properties", label: "Properties", tabs: [] },
    { section: "applications", label: "Applications", tabs: [] },
    { section: "residents", label: "Residents", tabs: [] },
    { section: "calendar", label: "Calendar", tabs: [] },
    {
      section: "relationships",
      label: "Account links",
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
      ],
    },
    { section: "plan", label: "Plan", tabs: [] },
    { section: "profile", label: "Profile", tabs: [] },
  ],
};
