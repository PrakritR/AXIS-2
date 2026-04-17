import type { PortalDefinition } from "@/lib/portal-types";

export const residentPortal: PortalDefinition = {
  kind: "resident",
  basePath: "/resident",
  title: "Resident portal",
  accent: "teal",
  sections: [
    { section: "dashboard", label: "Dashboard", tabs: [] },
    {
      section: "home",
      label: "My room / home",
      tabs: [
        { id: "overview", label: "Unit overview" },
        { id: "roommates", label: "Roommates & common areas" },
        { id: "rules", label: "House rules" },
        { id: "move-in", label: "Move-in info" },
      ],
    },
    {
      section: "lease",
      label: "Lease",
      tabs: [
        { id: "current", label: "Current lease" },
        { id: "pending", label: "Pending changes" },
        { id: "summary", label: "Lease summary" },
        { id: "pdf", label: "Download PDF" },
      ],
    },
    {
      section: "payments",
      label: "Payments",
      tabs: [
        { id: "upcoming", label: "Upcoming payments" },
        { id: "history", label: "Payment history" },
        { id: "deposit", label: "Deposit summary" },
        { id: "receipts", label: "Receipts" },
      ],
    },
    {
      section: "work-orders",
      label: "Work orders",
      tabs: [
        { id: "submit", label: "Submit request" },
        { id: "open", label: "Open requests" },
        { id: "history", label: "History" },
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
      section: "announcements",
      label: "Announcements",
      tabs: [
        { id: "latest", label: "Latest" },
        { id: "archived", label: "Archived" },
      ],
    },
    {
      section: "documents",
      label: "Documents",
      tabs: [
        { id: "lease", label: "Lease files" },
        { id: "move-in", label: "Move-in docs" },
        { id: "shared", label: "Shared docs" },
      ],
    },
    {
      section: "calendar",
      label: "Calendar",
      tabs: [
        { id: "overview", label: "Overview" },
        { id: "tours", label: "Tours & meetings" },
        { id: "important", label: "Important dates" },
      ],
    },
    {
      section: "profile",
      label: "Profile",
      tabs: [
        { id: "personal", label: "Personal info" },
        { id: "notifications", label: "Notification preferences" },
      ],
    },
    {
      section: "settings",
      label: "Settings",
      tabs: [
        { id: "security", label: "Password & security" },
        { id: "support", label: "Support contact" },
      ],
    },
    {
      section: "support",
      label: "Support",
      tabs: [
        { id: "faq", label: "FAQ" },
        { id: "contact", label: "Contact" },
      ],
    },
  ],
};
