import type { PortalDefinition } from "@/lib/portal-types";

export const managerPortal: PortalDefinition = {
  kind: "manager",
  basePath: "/manager",
  title: "Manager portal",
  accent: "blue",
  sections: [
    { section: "dashboard", label: "Dashboard", tabs: [] },
    {
      section: "properties",
      label: "Properties",
      tabs: [
        { id: "all", label: "All properties" },
        { id: "add", label: "Add property" },
        { id: "pending", label: "Pending review" },
        { id: "archived", label: "Archived" },
      ],
    },
    {
      section: "listings",
      label: "Listings",
      tabs: [
        { id: "active", label: "Active listings" },
        { id: "drafts", label: "Drafts" },
        { id: "create", label: "Create listing" },
      ],
    },
    {
      section: "calendar",
      label: "Calendar",
      tabs: [
        { id: "day", label: "Day" },
        { id: "week", label: "Week" },
        { id: "month", label: "Month" },
        { id: "availability", label: "Availability" },
        { id: "tours", label: "Tours" },
      ],
    },
    {
      section: "inbox",
      label: "Inbox",
      tabs: [
        { id: "all", label: "All" },
        { id: "unread", label: "Unread" },
        { id: "sent", label: "Sent" },
        { id: "trash", label: "Trash" },
        { id: "compose", label: "Compose" },
      ],
    },
    {
      section: "leasing",
      label: "Leasing",
      tabs: [
        { id: "draft", label: "Draft leases" },
        { id: "sent-review", label: "Sent for review" },
        { id: "approved", label: "Approved" },
        { id: "signed", label: "Signed" },
        { id: "archived", label: "Archived" },
      ],
    },
    {
      section: "residents",
      label: "Residents",
      tabs: [
        { id: "current", label: "Current residents" },
        { id: "move-ins", label: "Move-ins" },
        { id: "move-outs", label: "Move-outs" },
      ],
    },
    {
      section: "applicants",
      label: "Applicants",
      tabs: [
        { id: "new", label: "New applicants" },
        { id: "in-review", label: "In review" },
        { id: "approved", label: "Approved" },
        { id: "rejected", label: "Rejected" },
      ],
    },
    {
      section: "payments",
      label: "Payments",
      tabs: [
        { id: "upcoming", label: "Upcoming" },
        { id: "paid", label: "Paid" },
        { id: "late", label: "Late" },
        { id: "refunds", label: "Refunds" },
      ],
    },
    {
      section: "work-orders",
      label: "Work orders",
      tabs: [
        { id: "open", label: "Open" },
        { id: "in-progress", label: "In progress" },
        { id: "completed", label: "Completed" },
        { id: "archived", label: "Archived" },
      ],
    },
    {
      section: "announcements",
      label: "Announcements",
      tabs: [
        { id: "create", label: "Create announcement" },
        { id: "past", label: "Past announcements" },
      ],
    },
    {
      section: "documents",
      label: "Documents",
      tabs: [
        { id: "upload", label: "Upload" },
        { id: "shared", label: "Shared docs" },
        { id: "lease-files", label: "Lease files" },
        { id: "property-files", label: "Property files" },
      ],
    },
    {
      section: "profile",
      label: "Profile",
      tabs: [
        { id: "manager", label: "Manager info" },
        { id: "company", label: "Company info" },
        { id: "notifications", label: "Notification preferences" },
      ],
    },
    {
      section: "settings",
      label: "Settings",
      tabs: [
        { id: "account", label: "Account" },
        { id: "security", label: "Security" },
        { id: "integrations", label: "Integrations" },
        { id: "portal", label: "Portal preferences" },
      ],
    },
    {
      section: "help",
      label: "Help / support",
      tabs: [
        { id: "support", label: "Support" },
        { id: "guides", label: "Guides" },
      ],
    },
  ],
};
