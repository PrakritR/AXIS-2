/** Lease term labels shared by listing submission, rental application, and manager portal. */

export const LEASE_TERM_OPTIONS = ["3-Month", "9-Month", "12-Month", "Month-to-Month", "Custom"] as const;
export const SHORT_TERM_LEASE_TERM = "Short-Term Stay";
/**
 * "Custom" is the escape hatch a manager/applicant reaches for when none of the
 * named terms fit, so it is always listed LAST — after Short-Term Stay — in
 * every place lease terms are displayed (application dropdown + listing form
 * checkboxes). Ordering only: its value, label, and behaviour are unchanged.
 */
export const CUSTOM_LEASE_TERM = "Custom";

export type LeaseTermOption = (typeof LEASE_TERM_OPTIONS)[number];

/** Standard lease lengths plus short-term when offered on a listing. */
export const LISTING_LEASE_TERM_OPTION_SET = new Set<string>([...LEASE_TERM_OPTIONS, SHORT_TERM_LEASE_TERM]);
