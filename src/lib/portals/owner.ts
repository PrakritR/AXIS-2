import type { PortalDefinition } from "@/lib/portal-types";

/**
 * Owner portal: same primary navigation as the manager portal (minus “Add owner”),
 * so Free vs Pro gating feels identical. Owners invite property managers from Managers.
 */
export const ownerPortal: PortalDefinition = {
  kind: "owner",
  basePath: "/owner",
  title: "Owner portal",
  accent: "blue",
  sections: [
    { section: "dashboard", label: "Dashboard", tabs: [] },
    { section: "properties", label: "Properties", tabs: [] },
    { section: "applications", label: "Applications", tabs: [] },
    { section: "leases", label: "Leases", tabs: [] },
    { section: "payments", label: "Payments", tabs: [] },
    { section: "work-orders", label: "Work orders", tabs: [] },
    { section: "calendar", label: "Calendar", tabs: [] },
    { section: "stripe", label: "Stripe payouts", tabs: [] },
    { section: "managers", label: "Managers", tabs: [] },
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
