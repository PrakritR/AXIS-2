/** Client-safe resident portal access shape (no server imports). */

export type ManagerSubscriptionTier = "free" | "paid" | null;

export type ResidentPortalAccessState = {
  roleOk: boolean;
  /**
   * True when the resident owns at least one non-withdrawn
   * `manager_application_records` row — same ownership predicate and
   * withdrawn-row exclusion as their own Applications tab.
   */
  hasSubmittedApplication: boolean;
  /** True when at least one owned application is past the in-progress draft stage. */
  hasCompletedApplicationSubmission: boolean;
  /** Resident with no submitted application yet — Applications-only portal. */
  isPreApplicationResident: boolean;
  /** True when a tour inquiry is linked to this account by record id. */
  hasTourLink: boolean;
  /** Tour booked or application submitted, but lease access not yet unlocked. */
  isPreLeaseResident: boolean;
  /** True when ANY owned application is approved, not only the most recent one. */
  applicationApproved: boolean;
  applicationId: string | null;
  applicationStage: string | null;
  applicationProperty: string | null;
  /** Both manager and resident have signed the active lease. */
  leaseSigned: boolean;
  /** Full workspace (services, payments, move-in) — requires a signed lease. */
  leaseAccessUnlocked: boolean;
  fullPortalAccess: boolean;
  managerSubscriptionTier: ManagerSubscriptionTier;
};
