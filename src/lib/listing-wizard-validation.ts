import { isValidZipInput } from "@/lib/listing-form-inputs";
import { isEntireHomeListing, isListingFeeAmountFilled, resolveAllowedLeaseTerms, type ManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";
import { listingApplicationFeeChannels } from "@/lib/rental-application/application-fee-channel";
import { parseMoneyAmount } from "@/lib/parse-money";
import { LISTING_STEP_FIELD_ORDER } from "@/lib/wizard-field-errors";

export function listingRoomNameKey(roomId: string): string {
  return `room-${roomId}-name`;
}

export function listingRoomRentKey(roomId: string): string {
  return `room-${roomId}-rent`;
}

export function listingBathroomNameKey(bathId: string): string {
  return `bathroom-${bathId}-name`;
}

export function listingSharedSpaceNameKey(spaceId: string): string {
  return `shared-${spaceId}-name`;
}

export function listingCustomQuestionErrorKey(fieldId: string): string {
  return `appq-${fieldId}`;
}

export type ListingWizardValidateOptions = {
  isEditMode?: boolean;
  entireHomeRent?: number;
};

export function validateListingWizardStep(
  stepIndex: number,
  sub: ManagerListingSubmissionV1,
  opts: ListingWizardValidateOptions = {},
): Record<string, string> {
  const errs: Record<string, string> = {};
  const isEditMode = opts.isEditMode ?? false;
  const isEntireHome = isEntireHomeListing(sub);
  const entireHomeRent = opts.entireHomeRent ?? 0;

  if (stepIndex === 0) {
    if (!sub.address.trim()) errs.address = "Street address is required.";
    if (!sub.zip.trim()) errs.zip = "ZIP is required.";
    else if (!isValidZipInput(sub.zip)) errs.zip = "Enter a valid 5-digit ZIP or ZIP+4.";
    if (!isEditMode) {
      if (!sub.listingPropertyTypeId?.trim()) errs.listingPropertyTypeId = "Choose a property type.";
      if (!sub.listingStoriesId?.trim()) errs.listingStoriesId = "Select how many floors or levels the home has.";
      if (!sub.listingTotalBathroomsId?.trim()) errs.listingTotalBathroomsId = "Select how many bathrooms the home has.";
      if (!sub.listingBedroomSlots || sub.listingBedroomSlots < 1) {
        errs.listingBedroomSlots = "Select how many bedrooms you will list for rent.";
      }
    }
  }

  if (stepIndex === 1) {
    // Room cards are auto-created from the bedroom count with default names.
    // Names can be edited; other room fields stay optional on this step.
  }

  if (stepIndex === 2) {
    // Bathroom cards are auto-created from the bathroom count with default names.
  }

  if (stepIndex === 3) {
    // Shared spaces are fully optional — blank rows are dropped on submit.
  }

  if (stepIndex === 4) {
    if (!sub.listingPlaceCategoryId?.trim()) {
      errs.listingPlaceCategoryId = "Select how this property is rented (individual rooms or entire place).";
    }
    if (isEntireHome && entireHomeRent <= 0) {
      errs.monthlyRent = "Enter the monthly rent for the entire home.";
    }
    if (!isEntireHome) {
      const anyRent = sub.rooms.some((room) => room.monthlyRent > 0);
      if (!anyRent && sub.rooms.length > 0) {
        errs.monthlyRent = "Set monthly rent for at least one room (leave others at 0 if not offered).";
      }
    }
    const allowedTerms = resolveAllowedLeaseTerms(sub);
    if (allowedTerms.length === 0) errs.allowedLeaseTerms = "Select at least one lease term.";
    const feeFields: { key: keyof ManagerListingSubmissionV1; label: string }[] = [
      { key: "applicationFee", label: "Application fee" },
      { key: "securityDeposit", label: "Security deposit" },
      { key: "moveInFee", label: "Move-in fee" },
      { key: "parkingMonthly", label: "Parking (monthly)" },
      { key: "hoaMonthly", label: "HOA / community" },
      { key: "otherMonthlyFees", label: "Other monthly fees" },
      { key: "monthToMonthSurcharge", label: "Month-to-month surcharge" },
    ];
    for (const { key, label } of feeFields) {
      const raw = String(sub[key] ?? "");
      if (!isListingFeeAmountFilled(raw)) {
        errs[String(key)] = `${label} is required — enter 0 if there is no fee.`;
      }
    }
    if (sub.zellePaymentsEnabled && !sub.zelleContact?.trim()) {
      errs.zelleContact = "Enter a Zelle phone or email for resident payments.";
    }
    if (sub.venmoPaymentsEnabled && !sub.venmoContact?.trim()) {
      errs.venmoContact = "Enter a Venmo username, phone, or email for resident payments.";
    }
    const appFeeAmount = parseMoneyAmount(sub.applicationFee);
    if (appFeeAmount > 0) {
      const channels = listingApplicationFeeChannels(sub);
      if (!channels.ach && !channels.zelle && !channels.venmo && !channels.other) {
        errs.residentPaymentMethods = "Enable at least one resident payment method — applicants use the same options for the application fee.";
      }
    }
  }

  // Application step — saved overrides and custom questions must be complete.
  if (stepIndex === 7) {
    for (const field of sub.customApplicationFields ?? []) {
      const key = listingCustomQuestionErrorKey(field.id);
      if (!field.label.trim()) {
        errs[key] = "Enter the question, or remove it.";
        continue;
      }
      if (field.type === "select" && field.options.length === 0) {
        errs[key] = "Add at least one dropdown option (comma-separated).";
      }
    }
    if (Object.keys(errs).length > 0) {
      errs.customApplicationFields = "Complete each highlighted question below.";
    }
  }

  // Lease step — custom lease setup must have content when customization is on.
  if (stepIndex === 8 && sub.leaseConfigMode === "custom") {
    if (sub.leaseCustomKind === "document") {
      if (!sub.leaseTemplateDocUrl?.trim()) {
        errs.leaseTemplateDoc = "Upload your lease template (PDF), or switch back to the Axis standard lease.";
      }
    } else if (!sub.customLeaseTerms?.trim()) {
      errs.customLeaseTerms = "Enter the lease information you want included, or switch back to the Axis standard lease.";
    }
  }

  return errs;
}

/** Field scroll order for a step — static keys first, then per-row keys in list order. */
export function buildListingStepFieldOrder(stepIndex: number, sub: ManagerListingSubmissionV1): string[] {
  const base = [...(LISTING_STEP_FIELD_ORDER[stepIndex] ?? [])];
  if (stepIndex === 1) {
    return [...sub.rooms.map((r) => listingRoomNameKey(r.id)), "rooms"];
  }
  if (stepIndex === 2) {
    return [...sub.bathrooms.map((b) => listingBathroomNameKey(b.id)), "bathrooms"];
  }
  if (stepIndex === 3) {
    return [...sub.sharedSpaces.map((s) => listingSharedSpaceNameKey(s.id)), "sharedSpaces"];
  }
  if (stepIndex === 4 && !isEntireHomeListing(sub)) {
    const rentKeys = sub.rooms.map((r) => listingRoomRentKey(r.id));
    const monthlyIdx = base.indexOf("monthlyRent");
    if (monthlyIdx === -1) return [...rentKeys, ...base];
    return [...base.slice(0, monthlyIdx + 1), ...rentKeys, ...base.slice(monthlyIdx + 1)];
  }
  if (stepIndex === 7) {
    return [...(sub.customApplicationFields ?? []).map((f) => listingCustomQuestionErrorKey(f.id)), "customApplicationFields"];
  }
  return base;
}

/** First step (in order) that fails validation, or null if all pass through `lastStep`. */
export function firstInvalidListingStep(
  sub: ManagerListingSubmissionV1,
  opts: ListingWizardValidateOptions,
  lastStep = 4,
): { stepIndex: number; errors: Record<string, string> } | null {
  for (let i = 0; i <= lastStep; i++) {
    const errors = validateListingWizardStep(i, sub, opts);
    if (Object.keys(errors).length > 0) return { stepIndex: i, errors };
  }
  return null;
}
