/** Shared field-level error styling for multi-step wizards. */
export const WIZARD_FIELD_ERROR_RING = "border-red-400 ring-2 ring-red-100";
export const WIZARD_FIELD_ERROR_WRAP =
  "rounded-xl border-2 border-red-400/70 ring-2 ring-red-500/20";

export function wizardFieldErrorClass(hasError: boolean, base = ""): string {
  const parts = [base, hasError ? WIZARD_FIELD_ERROR_RING : ""].filter(Boolean);
  return parts.join(" ");
}

export function wizardSectionErrorClass(hasError: boolean, base = ""): string {
  const parts = [base, hasError ? WIZARD_FIELD_ERROR_WRAP : ""].filter(Boolean);
  return parts.join(" ");
}

/**
 * Scroll to the first invalid field (in `orderedKeys` order) inside optional root.
 * Error keys not in `orderedKeys` (e.g. dynamic manager-defined questions) are tried
 * afterwards in the errors map's own order.
 */
export function scrollToFirstWizardFieldError(
  orderedKeys: string[],
  errors: Record<string, string | undefined>,
  root?: HTMLElement | null,
): void {
  if (typeof document === "undefined") return;
  const ordered = new Set(orderedKeys);
  const remaining = Object.keys(errors).filter((key) => !ordered.has(key));
  for (const key of [...orderedKeys, ...remaining]) {
    if (!errors[key]) continue;
    const el =
      root?.querySelector(`[data-wizard-field="${key}"]`) ??
      document.querySelector(`[data-wizard-field="${key}"]`);
    if (!el || !(el instanceof HTMLElement)) continue;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    const focusable = el.matches("input, select, textarea, button")
      ? el
      : el.querySelector<HTMLElement>("input, select, textarea, button");
    focusable?.focus({ preventScroll: true });
    return;
  }
}

export const RENTAL_WIZARD_STEP_FIELD_ORDER: Record<number, string[]> = {
  1: ["applyingAsGroup", "groupRole", "groupSize", "groupId"],
  2: ["hasCosigner"],
  3: ["propertyId", "roomChoice1", "leaseTerm", "leaseStart", "leaseEnd"],
  4: ["fullLegalName", "dateOfBirth", "ssn", "driversLicense", "phone", "email"],
  5: ["currentStreet", "currentCity", "currentState", "currentZip", "currentMoveIn"],
  6: ["prevStreet", "prevCity", "prevState", "prevZip"],
  7: ["employer", "monthlyIncome", "annualIncome", "otherIncome"],
  8: ["ref1Name", "ref1Relationship", "ref1Phone"],
  9: ["occupancyCount", "evictionHistory", "bankruptcyHistory", "criminalHistory"],
  10: ["consentCredit", "consentTruth", "digitalSignature", "dateSigned"],
  12: ["applicationFeeZelleSentConfirmed"],
};

export const LISTING_STEP_FIELD_ORDER: Record<number, string[]> = {
  0: [
    "listingPropertyTypeId",
    "address",
    "zip",
    "listingStoriesId",
    "listingTotalBathroomsId",
    "listingBedroomSlots",
  ],
  1: ["rooms"],
  2: ["bathrooms"],
  3: ["sharedSpaces"],
  4: [
    "listingPlaceCategoryId",
    "monthlyRent",
    "allowedLeaseTerms",
    "applicationFee",
    "securityDeposit",
    "moveInFee",
    "parkingMonthly",
    "hoaMonthly",
    "otherMonthlyFees",
    "monthToMonthSurcharge",
    "zelleContact",
    "venmoContact",
    "applicationFeeOtherInstructions",
    "applicationFeeMethods",
  ],
  7: ["customApplicationFields"],
  8: ["customLeaseTerms", "leaseTemplateDoc"],
};

export const COSIGNER_STEP_FIELD_ORDER: Record<number, string[]> = {
  1: ["signerAppId", "signerFullName"],
  2: ["fullName", "email", "phone", "dob", "dlNumber", "ssn", "address", "city", "state", "zip"],
  3: [
    "employerName",
    "employerAddress",
    "supervisorName",
    "supervisorPhone",
    "jobTitle",
    "monthlyIncome",
    "annualIncome",
    "employmentStart",
    "otherIncome",
  ],
  4: ["bankruptcy", "criminal", "consentCredit"],
  5: ["signature", "dateSigned"],
};

export const TOUR_STEP_FIELD_ORDER: Record<number, string[]> = {
  1: ["property", "room"],
  2: ["tourSlot"],
  3: ["name", "email", "phone"],
};

export const PARTNER_MEETING_STEP_FIELD_ORDER: Record<number, string[]> = {
  1: ["tourSlots"],
  2: ["name", "email", "phone"],
};
