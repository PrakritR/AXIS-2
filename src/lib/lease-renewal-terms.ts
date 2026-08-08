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
