import type { PortalSection } from "@/lib/portal-types";

/** Base path for resident portal — shared by web and Capacitor WebView. */
export const RESIDENT_PORTAL_BASE_PATH = "/resident";

/**
 * Resident sections available when the linked manager is on a free subscription.
 * Single source of truth — also drives manager-access tier gating.
 */
export const RESIDENT_FREE_TIER_SECTION_IDS = [
  "dashboard",
  "applications",
  "payments",
  "move-in",
  "profile",
  "bugs-feedback",
] as const;

export type ResidentFreeTierSectionId = (typeof RESIDENT_FREE_TIER_SECTION_IDS)[number];

const INBOX_TABS = [
  { id: "unopened", label: "Unopened" },
  { id: "opened", label: "Opened" },
  { id: "sent", label: "Sent" },
  { id: "trash", label: "Trash" },
] as const;

const FINANCES_TABS = [
  { id: "summary", label: "Summary" },
  { id: "statements", label: "Rent statements" },
] as const;

const SERVICES_TABS = [
  { id: "requests", label: "Requests" },
  { id: "work-orders", label: "Work orders" },
] as const;

/** Sections shown before lease access is fully unlocked. */
export const RESIDENT_LIMITED_PORTAL_SECTIONS: PortalSection[] = [
  { section: "dashboard", label: "Dashboard", tabs: [] },
  { section: "applications", label: "Applications", tabs: [] },
  { section: "payments", label: "Payments", tabs: [] },
  { section: "move-in", label: "Move-in", tabs: [] },
  { section: "inbox", label: "Inbox", tabs: [...INBOX_TABS] },
  { section: "documents", label: "Documents", tabs: [{ id: "receipts", label: "Rent receipts" }] },
  { section: "financials", label: "Finances", tabs: [...FINANCES_TABS] },
  { section: "bugs-feedback", label: "Feedback", tabs: [] },
  { section: "profile", label: "Settings", tabs: [] },
];

/** Full resident workspace after lease approval. */
export const RESIDENT_APPROVED_PORTAL_SECTIONS: PortalSection[] = [
  { section: "dashboard", label: "Dashboard", tabs: [] },
  { section: "applications", label: "Applications", tabs: [] },
  { section: "payments", label: "Payments", tabs: [] },
  { section: "move-in", label: "Move-in", tabs: [] },
  { section: "services", label: "Services", tabs: [...SERVICES_TABS] },
  { section: "inbox", label: "Inbox", tabs: [...INBOX_TABS] },
  {
    section: "documents",
    label: "Documents",
    tabs: [
      { id: "lease", label: "Lease" },
      { id: "receipts", label: "Rent receipts" },
    ],
  },
  { section: "financials", label: "Finances", tabs: [...FINANCES_TABS] },
  { section: "bugs-feedback", label: "Feedback", tabs: [] },
  { section: "profile", label: "Settings", tabs: [] },
];

/** Every resident nav section id (union of limited + approved definitions). */
export const RESIDENT_PORTAL_SECTION_IDS = [
  ...new Set([
    ...RESIDENT_LIMITED_PORTAL_SECTIONS.map((s) => s.section),
    ...RESIDENT_APPROVED_PORTAL_SECTIONS.map((s) => s.section),
  ]),
] as const;

/**
 * Resident routes with dedicated handlers in render-portal-section.tsx.
 * Update this list when adding a new section — platform-parity tests enforce it.
 */
export const RESIDENT_RENDERED_SECTION_IDS = [
  "dashboard",
  "applications",
  "payments",
  "move-in",
  "inbox",
  "documents",
  "financials",
  "bugs-feedback",
  "profile",
  "services",
  "lease",
  "work-orders",
] as const;

/** Default smoke-test paths for web + native WebView (limited resident workspace). */
export const RESIDENT_PORTAL_SMOKE_PATHS = [
  { label: "Dashboard", path: `${RESIDENT_PORTAL_BASE_PATH}/dashboard` },
  { label: "Applications", path: `${RESIDENT_PORTAL_BASE_PATH}/applications` },
  { label: "Payments", path: `${RESIDENT_PORTAL_BASE_PATH}/payments` },
  { label: "Move-in", path: `${RESIDENT_PORTAL_BASE_PATH}/move-in` },
  { label: "Inbox", path: `${RESIDENT_PORTAL_BASE_PATH}/inbox/unopened` },
  { label: "Documents", path: `${RESIDENT_PORTAL_BASE_PATH}/documents/receipts` },
  { label: "Finances", path: `${RESIDENT_PORTAL_BASE_PATH}/financials/summary` },
] as const;

export function residentSectionHref(section: string, tabId?: string): string {
  const base = `${RESIDENT_PORTAL_BASE_PATH}/${section}`;
  return tabId ? `${base}/${tabId}` : base;
}
