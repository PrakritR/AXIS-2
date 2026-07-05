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
    { section: "calendar", label: "Calendar", tabs: [] },
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
        { id: "income-documents", label: "Income documents" },
        { id: "expense-documents", label: "Expense documents" },
        { id: "1099", label: "1099 forms" },
        { id: "tax-summary", label: "Tax summary" },
      ],
    },
    {
      section: "inbox",
      label: "Inbox",
      tabs: [
        { id: "unopened", label: "Unopened" },
        { id: "opened", label: "Opened" },
        { id: "schedule", label: "Schedule" },
        { id: "sent", label: "Sent" },
        { id: "trash", label: "Trash" },
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
      section: "financials",
      label: "Finances",
      tabs: [
        { id: "income", label: "Income" },
        { id: "expenses", label: "Expenses" },
      ],
    },
    {
      section: "relationships",
      label: "Co-managers",
      tabs: [],
    },
    { section: "promotion", label: "Promotion", tabs: [] },
    { section: "bugs-feedback", label: "Feedback", tabs: [] },
    { section: "profile", label: "Settings", tabs: [] },
  ],
};

/** Default smoke-test paths for web + native WebView (manager/pro portal). */
export const MANAGER_PORTAL_SMOKE_PATHS = [
  { label: "Dashboard", path: "/portal/dashboard" },
  { label: "Properties", path: "/portal/properties" },
  { label: "Calendar", path: "/portal/calendar" },
  { label: "Applications", path: "/portal/applications" },
  { label: "Residents", path: "/portal/residents/current" },
  { label: "Leases", path: "/portal/leases" },
  { label: "Payments", path: "/portal/payments" },
  { label: "Services", path: "/portal/services/requests" },
  { label: "Inbox", path: "/portal/inbox/unopened" },
  { label: "Documents", path: "/portal/documents/income-documents" },
  { label: "Finances", path: "/portal/financials/income" },
  { label: "Co-managers", path: "/portal/relationships" },
  { label: "Promotion", path: "/portal/promotion" },
  { label: "Feedback", path: "/portal/bugs-feedback" },
  { label: "Settings", path: "/portal/profile" },
] as const;
