/** Lease term labels shared by listing submission, rental application, and manager portal. */

export const LEASE_TERM_OPTIONS = ["3-Month", "9-Month", "12-Month", "Month-to-Month", "Custom"] as const;
export const SHORT_TERM_LEASE_TERM = "Short-Term Stay";

export type LeaseTermOption = (typeof LEASE_TERM_OPTIONS)[number];
