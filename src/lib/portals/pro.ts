import type { PortalDefinition } from "@/lib/portal-types";

/** Unified property workspace — managers, owners, and paid workspace users share one portal. */
export const proPortal: PortalDefinition = {
  kind: "pro",
  basePath: "/portal",
  title: "Axis",
  accent: "blue",
  sections: [
    { section: "dashboard", label: "Dashboard", tabs: [] },
    { section: "properties", label: "Properties", tabs: [] },
    { section: "calendar", label: "Tours", tabs: [] },
    { section: "applications", label: "Applications", tabs: [] },
    {
      section: "residents",
      label: "Residents",
      tabs: [
        { id: "current", label: "Current residents" },
        { id: "previous", label: "Previous residents" },
      ],
    },
    {
      section: "leases",
      label: "Leases",
      tabs: [],
    },
    {
      section: "payments",
      label: "Payments",
      tabs: [],
    },
    {
      section: "documents",
      label: "Documents",
      tabs: [
        { id: "summary", label: "Tax summary" },
        { id: "rent-receipts", label: "Rent receipts" },
        { id: "expenses", label: "Repairs & expenses" },
        { id: "rental-days", label: "Days rented" },
        { id: "profit-loss", label: "Income & expenses" },
        { id: "1099", label: "1099 forms" },
      ],
    },
    {
      section: "services",
      label: "Services",
      tabs: [
        { id: "requests", label: "Requests" },
        { id: "work-orders", label: "Work orders" },
        { id: "vendors", label: "Vendors" },
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
    { section: "bugs-feedback", label: "Feedback", tabs: [] },
    {
      section: "relationships",
      label: "Co-managers",
      tabs: [],
    },
    { section: "plan", label: "Plan", tabs: [] },
    { section: "profile", label: "Profile", tabs: [] },
  ],
};
