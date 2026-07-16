/**
 * Canonical portal test accounts shared by `/demo`, E2E seeds, and the
 * production→demo read mirror. These emails are sandbox-only
 * (`isPortalSandboxEmail`) and never trigger real outbound mail.
 */
export const CANONICAL_DEMO_MANAGER_EMAIL = "manager@test.axis.local";
export const CANONICAL_DEMO_RESIDENT_EMAIL = "resident@test.axis.local";
export const CANONICAL_DEMO_VENDOR_EMAIL = "vendor@test.axis.local";

/** Admin-only sandbox account — no portfolio data seeded or mirrored in idle mode. */
export const CANONICAL_DEMO_ADMIN_EMAIL = "testeverything@test.axis.local";

/** Guided tour autoplay mirrors this account's real portal data (blank when it has none). */
export const CANONICAL_DEMO_GUIDED_EMAIL = CANONICAL_DEMO_ADMIN_EMAIL;
export const CANONICAL_DEMO_GUIDED_NAME = "Test Everything";

export const CANONICAL_DEMO_MANAGER_NAME = "Test Manager";
export const CANONICAL_DEMO_RESIDENT_NAME = "Test Resident";
export const CANONICAL_DEMO_VENDOR_NAME = "Test Vendor";

export const CANONICAL_DEMO_ACCOUNT_EMAILS = [
  CANONICAL_DEMO_MANAGER_EMAIL,
  CANONICAL_DEMO_RESIDENT_EMAIL,
  CANONICAL_DEMO_VENDOR_EMAIL,
] as const;
