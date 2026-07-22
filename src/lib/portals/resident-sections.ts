import type { PortalSection } from "@/lib/portal-types";

/** Base path for resident portal — shared by web and Capacitor WebView. */
export const RESIDENT_PORTAL_BASE_PATH = "/resident";

/**
 * Resident sections available when the linked manager is on a free subscription.
 * Single source of truth — also drives manager-access tier gating.
 */
export const RESIDENT_FREE_TIER_SECTION_IDS = [
  "dashboard",
  "lease",
  "applications",
  "payments",
  "move-in",
  "profile",
] as const;

export type ResidentFreeTierSectionId = (typeof RESIDENT_FREE_TIER_SECTION_IDS)[number];

const INBOX_TABS = [
  { id: "unopened", label: "Unopened" },
  { id: "opened", label: "Opened" },
  { id: "schedule", label: "Schedule" },
  { id: "sent", label: "Sent" },
  { id: "trash", label: "Trash" },
] as const;

const SERVICES_TABS = [
  { id: "requests", label: "Add-on services" },
  { id: "work-orders", label: "Work orders" },
] as const;

const DOCUMENTS_TABS = [
  { id: "application", label: "Application" },
  { id: "lease", label: "Lease" },
  { id: "receipts", label: "Rent receipts" },
  { id: "shared", label: "Shared with you" },
  { id: "other", label: "Other documents" },
] as const;

/**
 * Payments is Charges-only — there is no tab switcher. Pending / Overdue / Paid
 * are in-section *status filters* (`ManagerPortalStatusPills`) inside the panel,
 * not URL-linked tabs. Summary and Statements were removed from the resident
 * portal; their routes redirect to the Charges view (see
 * RESIDENT_PAYMENTS_LEGACY_TABS + the payments handler in render-portal-section).
 */
const PAYMENTS_TABS = [] as const;

/**
 * Legacy payments sub-paths → optional status pill on the Charges view. Summary,
 * Statements, and Balance no longer exist in the resident portal; they land on
 * Charges with no status. Pending / Overdue / Paid preselect the matching pill.
 */
export const RESIDENT_PAYMENTS_LEGACY_TABS: Record<string, { status?: string }> = {
  pending: { status: "pending" },
  overdue: { status: "overdue" },
  paid: { status: "paid" },
  balance: {},
  summary: {},
  statements: {},
  charges: {},
};

/** Sidebar during application phase (before lease is approved): Application + Settings only. */
export const RESIDENT_APPLICATION_PHASE_PORTAL_SECTIONS: PortalSection[] = [
  { section: "applications", label: "Application", tabs: [] },
  { section: "profile", label: "Settings", tabs: [] },
];

/** @deprecated Use RESIDENT_APPLICATION_PHASE_PORTAL_SECTIONS */
export const RESIDENT_PRE_APPLICATION_PORTAL_SECTIONS = RESIDENT_APPLICATION_PHASE_PORTAL_SECTIONS;

/** Sections shown before lease access is fully unlocked. */
export const RESIDENT_LIMITED_PORTAL_SECTIONS: PortalSection[] = [
  { section: "dashboard", label: "Dashboard", tabs: [] },
  { section: "applications", label: "Applications", tabs: [] },
  { section: "lease", label: "Lease", tabs: [] },
  { section: "payments", label: "Payments", tabs: [...PAYMENTS_TABS] },
  { section: "move-in", label: "House details", tabs: [] },
  { section: "communication", label: "Communication", tabs: [...INBOX_TABS] },
  { section: "documents", label: "Documents", tabs: [...DOCUMENTS_TABS] },
  { section: "profile", label: "Settings", tabs: [] },
];

/** Full resident workspace after lease approval. */
export const RESIDENT_APPROVED_PORTAL_SECTIONS: PortalSection[] = [
  { section: "dashboard", label: "Dashboard", tabs: [] },
  { section: "applications", label: "Applications", tabs: [] },
  { section: "lease", label: "Lease", tabs: [] },
  { section: "payments", label: "Payments", tabs: [...PAYMENTS_TABS] },
  { section: "move-in", label: "House details", tabs: [] },
  { section: "services", label: "Services", tabs: [...SERVICES_TABS] },
  { section: "communication", label: "Communication", tabs: [...INBOX_TABS] },
  { section: "documents", label: "Documents", tabs: [...DOCUMENTS_TABS] },
  { section: "profile", label: "Settings", tabs: [] },
];

/** Every resident nav section id (union of limited + approved definitions). */
export const RESIDENT_PORTAL_SECTION_IDS = [
  ...new Set([
    ...RESIDENT_PRE_APPLICATION_PORTAL_SECTIONS.map((s) => s.section),
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
  "lease",
  "payments",
  "move-in",
  "communication",
  "documents",
  "bugs-feedback",
  "profile",
  "services",
  "work-orders",
  /** Legacy route — applications content lives under Documents */
  "applications",
  /** Legacy route — redirects to payments */
  "financials",
] as const;

/** Default smoke-test paths for web + native WebView (limited resident workspace). */
export const RESIDENT_PORTAL_SMOKE_PATHS = [
  { label: "Dashboard", path: `${RESIDENT_PORTAL_BASE_PATH}/dashboard` },
  { label: "Applications", path: `${RESIDENT_PORTAL_BASE_PATH}/applications` },
  { label: "Lease", path: `${RESIDENT_PORTAL_BASE_PATH}/lease` },
  { label: "Payments", path: `${RESIDENT_PORTAL_BASE_PATH}/payments` },
  { label: "House details", path: `${RESIDENT_PORTAL_BASE_PATH}/move-in` },
  { label: "Communication", path: `${RESIDENT_PORTAL_BASE_PATH}/communication/email/unopened` },
  { label: "Documents", path: `${RESIDENT_PORTAL_BASE_PATH}/documents/application` },
] as const;

export function residentSectionHref(section: string, tabId?: string): string {
  const base = `${RESIDENT_PORTAL_BASE_PATH}/${section}`;
  return tabId ? `${base}/${tabId}` : base;
}
