import type { PortalDefinition } from "@/lib/portal-types";

export const managerPortal: PortalDefinition = {
  kind: "manager",
  basePath: "/manager",
  title: "Manager portal",
  accent: "blue",
  sections: [
    { section: "dashboard", label: "Dashboard", tabs: [] },
    { section: "properties", label: "Properties", tabs: [] },
    { section: "applications", label: "Applications", tabs: [] },
    {
      section: "payments",
      label: "Payments",
      tabs: [
        { id: "ledger", label: "Rent & collections" },
        { id: "stripe", label: "Stripe payouts" },
      ],
    },
    { section: "leases", label: "Leases", tabs: [] },
    { section: "work-orders", label: "Work orders", tabs: [] },
    { section: "calendar", label: "Calendar", tabs: [] },
    {
      section: "people",
      label: "Owners / managers",
      tabs: [
        { id: "owners", label: "Owners" },
        { id: "managers", label: "Managers" },
      ],
    },
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
