import type { PortalDefinition } from "@/lib/portal-types";

/** Resident portal — matches marketing chrome + sidebar (leases, payments, work orders, inbox). */
export const residentPortal: PortalDefinition = {
  kind: "resident",
  basePath: "/resident",
  title: "Resident portal",
  accent: "blue",
  sections: [
    { section: "dashboard", label: "Dashboard", tabs: [] },
    { section: "properties", label: "Properties", tabs: [] },
    {
      section: "applications",
      label: "Applications",
      tabs: [
        { id: "pending", label: "Pending" },
        { id: "approved", label: "Approved" },
        { id: "rejected", label: "Rejected" },
      ],
    },
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
      section: "payments",
      label: "Payments",
      tabs: [
        { id: "pending", label: "Pending" },
        { id: "overdue", label: "Overdue" },
        { id: "paid", label: "Paid" },
      ],
    },
    {
      section: "work-orders",
      label: "Work orders",
      tabs: [
        { id: "open", label: "Open" },
        { id: "scheduled", label: "Scheduled" },
        { id: "completed", label: "Completed" },
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
