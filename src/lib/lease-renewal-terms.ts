import { listingAllowedLeaseTerms } from "@/lib/rental-application/data";
import {
  LEASE_TERM_OPTIONS,
  SHORT_TERM_LEASE_TERM,
  sortLeaseTermsCanonical,
} from "@/lib/rental-application/lease-terms";

/** Lease term choices for the renew-lease modal — scoped to what the listing offers. */
export function renewalLeaseTermOptionsForProperty(propertyId: string): string[] {
  const fromListing = propertyId.trim() ? listingAllowedLeaseTerms(propertyId.trim()) : [];
  const fallback = [...LEASE_TERM_OPTIONS, SHORT_TERM_LEASE_TERM];
  return sortLeaseTermsCanonical(fromListing.length > 0 ? fromListing : fallback);
}

export function renewalRentalTypeForTerm(leaseTerm: string): "standard" | "short_term" {
  return leaseTerm.trim() === SHORT_TERM_LEASE_TERM ? "short_term" : "standard";
}

const FIXED_LEASE_TERM_RE = /^\d+-Month$/;

export type ExtendMoveOutTypeId = "month_to_month" | "short_term" | "long_term" | "custom";

export type ExtendMoveOutTypeOption =
  | { id: "month_to_month"; label: "Month-to-month"; leaseTerm: "Month-to-Month" }
  | { id: "short_term"; label: "Short term"; leaseTerm: typeof SHORT_TERM_LEASE_TERM }
  | { id: "long_term"; label: "Long term"; leaseTerms: string[] }
  | { id: "custom"; label: "Custom" };

/** Resident extend-move-out types offered for a listing (month-to-month, short, fixed, custom). */
export function extendMoveOutTypesForProperty(propertyId: string): ExtendMoveOutTypeOption[] {
  const terms = renewalLeaseTermOptionsForProperty(propertyId);
  const options: ExtendMoveOutTypeOption[] = [];

  if (terms.includes("Month-to-Month")) {
    options.push({ id: "month_to_month", label: "Month-to-month", leaseTerm: "Month-to-Month" });
  }
  if (terms.includes(SHORT_TERM_LEASE_TERM)) {
    options.push({ id: "short_term", label: "Short term", leaseTerm: SHORT_TERM_LEASE_TERM });
  }

  const fixedTerms = terms.filter(
    (term) => term !== "Month-to-Month" && term !== SHORT_TERM_LEASE_TERM && term !== "Custom" && FIXED_LEASE_TERM_RE.test(term),
  );
  if (fixedTerms.length > 0) {
    options.push({ id: "long_term", label: "Long term", leaseTerms: fixedTerms });
  }

  options.push({ id: "custom", label: "Custom" });

  return options;
}
