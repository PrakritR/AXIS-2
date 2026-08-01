/** Client-safe resident portal access shape (no server imports). */

export type ManagerSubscriptionTier = "free" | "paid" | null;

export type ResidentPortalAccessState = {
  roleOk: boolean;
  /** True when any manager_application_records row exists for this resident email. */
  hasSubmittedApplication: boolean;
  /** True when at least one application is past the in-progress draft stage. */
  hasCompletedApplicationSubmission: boolean;
  /** Resident with no submitted application yet — Applications-only portal. */
  isPreApplicationResident: boolean;
  /** True when a tour inquiry is linked to this account by record id. */
  hasTourLink: boolean;
  /** Tour booked or application submitted, but lease access not yet unlocked. */
  isPreLeaseResident: boolean;
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
