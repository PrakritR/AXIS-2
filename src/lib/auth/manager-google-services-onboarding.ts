/** Post-signup onboarding: progressive Google Calendar + Gmail consent (not bundled into sign-in). */
export const MANAGER_GOOGLE_SERVICES_ONBOARDING_PATH = "/auth/connect-google-services";

/** Client redirect after pricing / account creation — onboarding page decides skip vs show. */
export function managerPortalEntryPath(fallback = "/portal/dashboard"): string {
  void fallback;
  return MANAGER_GOOGLE_SERVICES_ONBOARDING_PATH;
}
