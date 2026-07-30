import { listingAllowedLeaseTerms } from "@/lib/rental-application/data";
import { CUSTOM_LEASE_TERM, SHORT_TERM_LEASE_TERM } from "@/lib/rental-application/lease-terms";
import type { RentalWizardFormState } from "@/lib/rental-application/types";

export const RESIDENT_LEASE_TERM_CUSTOM = "__custom__";

/** Default manual-resident presets when no property is selected yet. */
export const RESIDENT_LEASE_TERM_FALLBACK_PRESETS = [
  "Month-to-month",
  "12 months",
  "6 months",
  "3 months",
] as const;

const LISTING_TO_RESIDENT_VALUE: Record<string, string> = {
  "Month-to-Month": "Month-to-month",
  "12-Month": "12 months",
  "9-Month": "9 months",
  "6-Month": "6 months",
  "3-Month": "3 months",
  [SHORT_TERM_LEASE_TERM]: SHORT_TERM_LEASE_TERM,
};

const RESIDENT_TO_LISTING_VALUE: Record<string, string> = {
  "Month-to-month": "Month-to-Month",
  "12 months": "12-Month",
  "9 months": "9-Month",
  "6 months": "6-Month",
  "3 months": "3-Month",
  [SHORT_TERM_LEASE_TERM]: SHORT_TERM_LEASE_TERM,
};

/** Normalize manual-resident or legacy labels to application/listing lease-term values for templates and dates. */
export function normalizeApplicationLeaseTerm(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (RESIDENT_TO_LISTING_VALUE[t]) return RESIDENT_TO_LISTING_VALUE[t]!;
  if (t === "Month-to-Month" || t === CUSTOM_LEASE_TERM) return t;
  const legacyMonths = t.match(/^(\d+)\s*months?$/i);
  if (legacyMonths) return `${legacyMonths[1]}-Month`;
  return t;
}

/** Application fields needed so lease generation picks the right property template. */
export function residentLeaseTermToApplicationFields(
  residentLeaseTerm: string,
  customMode: boolean,
): Pick<RentalWizardFormState, "leaseTerm" | "rentalType"> {
  const trimmed = residentLeaseTerm.trim();
  if (customMode) {
    if (!trimmed) return { leaseTerm: "", rentalType: "standard" };
    const fromCustom = normalizeApplicationLeaseTerm(trimmed);
    if (fromCustom === SHORT_TERM_LEASE_TERM) {
      return { leaseTerm: SHORT_TERM_LEASE_TERM, rentalType: "short_term" };
    }
    const standardTerms = new Set([
      "Month-to-Month",
      "3-Month",
      "6-Month",
      "9-Month",
      "12-Month",
      CUSTOM_LEASE_TERM,
    ]);
    if (standardTerms.has(fromCustom)) {
      return { leaseTerm: fromCustom, rentalType: "standard" };
    }
    return { leaseTerm: trimmed, rentalType: "standard" };
  }
  if (!trimmed) return { leaseTerm: "", rentalType: "standard" };
  if (trimmed === SHORT_TERM_LEASE_TERM) {
    return { leaseTerm: SHORT_TERM_LEASE_TERM, rentalType: "short_term" };
  }
  const canonical = normalizeApplicationLeaseTerm(trimmed);
  if (canonical === CUSTOM_LEASE_TERM) {
    return { leaseTerm: CUSTOM_LEASE_TERM, rentalType: "standard" };
  }
  return { leaseTerm: canonical, rentalType: "standard" };
}

/** Map a listing/application lease term label to the manual-resident dropdown value. */
export function listingLeaseTermToResidentValue(term: string): string {
  const t = term.trim();
  if (!t) return "";
  return LISTING_TO_RESIDENT_VALUE[t] ?? t;
}

export type ResidentLeaseTermOption = { value: string; label: string };

/** Lease term choices for add/edit resident modals, gated by the property listing when known. */
export function residentLeaseTermOptionsForProperty(propertyId: string): ResidentLeaseTermOption[] {
  const fallback = RESIDENT_LEASE_TERM_FALLBACK_PRESETS.map((value) => ({ value, label: value }));

  const pid = propertyId.trim();
  if (!pid) return fallback;

  const allowed = listingAllowedLeaseTerms(pid);
  const options: ResidentLeaseTermOption[] = [];
  const seen = new Set<string>();

  for (const listingTerm of allowed) {
    if (listingTerm === CUSTOM_LEASE_TERM) continue;
    const value = listingLeaseTermToResidentValue(listingTerm);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    options.push({ value, label: value });
  }

  return options.length > 0 ? options : fallback;
}

export function residentLeaseTermSelectValue(
  leaseTerm: string,
  customMode: boolean,
  presetValues: readonly string[],
): string {
  if (customMode) return RESIDENT_LEASE_TERM_CUSTOM;
  const trimmed = leaseTerm.trim();
  if (!trimmed) return "";
  if (presetValues.includes(trimmed)) return trimmed;
  return RESIDENT_LEASE_TERM_CUSTOM;
}

export function isResidentMonthToMonthLease(leaseTerm: string): boolean {
  const t = leaseTerm.trim();
  return t === "Month-to-month" || t === "Month-to-Month";
}

export function shouldUseResidentLeaseCustomMode(leaseTerm: string, presetValues: readonly string[]): boolean {
  const trimmed = leaseTerm.trim();
  if (!trimmed) return false;
  return !presetValues.includes(trimmed);
}
