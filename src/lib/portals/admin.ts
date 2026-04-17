import type { PortalDefinition } from "@/lib/portal-types";

export const adminPortal: PortalDefinition = {
  kind: "admin",
  basePath: "/admin",
  title: "Admin portal",
  accent: "slate",
  sections: [
    { section: "dashboard", label: "Dashboard", tabs: [] },
    {
      section: "properties",
      label: "Properties",
      tabs: [
        { id: "all", label: "All properties" },
        { id: "pending", label: "Pending approval" },
        { id: "active", label: "Active" },
        { id: "archived", label: "Archived" },
      ],
    },
    {
      section: "listings",
      label: "Listings",
      tabs: [
        { id: "active", label: "Active" },
        { id: "drafts", label: "Drafts" },
        { id: "hidden", label: "Hidden" },
      ],
    },
    {
      section: "managers",
      label: "Managers",
      tabs: [
        { id: "all", label: "All managers" },
        { id: "pending", label: "Pending" },
        { id: "approved", label: "Approved" },
        { id: "suspended", label: "Suspended" },
      ],
    },
    {
      section: "residents",
      label: "Residents",
      tabs: [
        { id: "current", label: "Current" },
        { id: "move-in-pending", label: "Move-in pending" },
        { id: "move-out-pending", label: "Move-out pending" },
        { id: "former", label: "Former" },
      ],
    },
    {
      section: "applicants",
      label: "Applicants",
      tabs: [
        { id: "new", label: "New" },
        { id: "under-review", label: "Under review" },
        { id: "approved", label: "Approved" },
        { id: "rejected", label: "Rejected" },
      ],
    },
    {
      section: "leasing",
      label: "Leasing",
      tabs: [
        { id: "requests", label: "Lease requests" },
        { id: "manager-edits", label: "Manager edit requests" },
        { id: "admin-review", label: "Admin review" },
        { id: "sent-out", label: "Sent out" },
        { id: "signed", label: "Signed" },
        { id: "archived", label: "Archived" },
      ],
    },
    {
      section: "payments",
      label: "Payments",
      tabs: [
        { id: "overview", label: "Overview" },
        { id: "by-property", label: "By property" },
        { id: "by-resident", label: "By resident" },
        { id: "failed", label: "Failed" },
        { id: "refunds", label: "Refunds" },
      ],
    },
    {
      section: "work-orders",
      label: "Work orders",
      tabs: [
        { id: "new", label: "New" },
        { id: "assigned", label: "Assigned" },
        { id: "in-progress", label: "In progress" },
        { id: "completed", label: "Completed" },
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
        { id: "new", label: "New announcement" },
        { id: "scheduled", label: "Scheduled" },
        { id: "sent", label: "Sent" },
        { id: "archived", label: "Archived" },
      ],
    },
    {
      section: "documents",
      label: "Documents",
      tabs: [
        { id: "lease-pdfs", label: "Lease PDFs" },
        { id: "property", label: "Property documents" },
        { id: "resident", label: "Resident files" },
        { id: "manager-uploads", label: "Manager uploads" },
      ],
    },
    {
      section: "calendar",
      label: "Calendar",
      tabs: [
        { id: "tours", label: "Tours" },
        { id: "deadlines", label: "Deadlines" },
        { id: "tasks", label: "Tasks" },
        { id: "availability", label: "Availability" },
      ],
    },
    {
      section: "analytics",
      label: "Analytics",
      tabs: [
        { id: "occupancy", label: "Occupancy" },
        { id: "revenue", label: "Revenue" },
        { id: "applications", label: "Applications" },
        { id: "tours", label: "Tours" },
        { id: "maintenance", label: "Maintenance" },
      ],
    },
    {
      section: "users",
      label: "User management",
      tabs: [
        { id: "admins", label: "Admin users" },
        { id: "roles", label: "Roles" },
        { id: "permissions", label: "Permissions" },
      ],
    },
    {
      section: "settings",
      label: "Settings",
      tabs: [
        { id: "global", label: "Global settings" },
        { id: "branding", label: "Branding" },
        { id: "notifications", label: "Notifications" },
        { id: "integrations", label: "Integrations" },
      ],
    },
    {
      section: "tools",
      label: "Admin tools",
      tabs: [
        { id: "airtable", label: "Airtable sync (placeholder)" },
        { id: "stripe", label: "Stripe (placeholder)" },
        { id: "audit", label: "Audit logs" },
        { id: "status", label: "System status" },
      ],
    },
  ],
};
