import { isDigitsOnlyLabel, isValidZipInput } from "@/lib/listing-form-inputs";
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
    for (const room of sub.rooms) {
      const key = listingRoomNameKey(room.id);
      if (!room.name.trim()) errs[key] = "Room name is required.";
      else if (isDigitsOnlyLabel(room.name)) errs[key] = "Use a label, not numbers only (e.g. Room 12A).";
    }
    if (Object.keys(errs).length > 0) errs.rooms = "Complete each highlighted room below.";
  }

  if (stepIndex === 2) {
    for (const bath of sub.bathrooms) {
      const key = listingBathroomNameKey(bath.id);
      if (!bath.name.trim()) errs[key] = "Bathroom name is required.";
    }
    if (Object.keys(errs).length > 0) errs.bathrooms = "Name each highlighted bathroom.";
  }

  if (stepIndex === 3) {
    for (const space of sub.sharedSpaces) {
      const key = listingSharedSpaceNameKey(space.id);
      if (!space.name.trim()) errs[key] = "Shared space name is required.";
    }
    if (Object.keys(errs).length > 0) errs.sharedSpaces = "Name each highlighted shared space.";
  }

  if (stepIndex === 4) {
    if (!sub.listingPlaceCategoryId?.trim()) {
      errs.listingPlaceCategoryId = "Select how this property is rented (individual rooms or entire place).";
    }
    if (isEntireHome && entireHomeRent <= 0) {
      errs.monthlyRent = "Enter the monthly rent for the entire home.";
    }
    if (!isEntireHome) {
      let anyRent = false;
      for (const room of sub.rooms) {
        if (room.monthlyRent > 0) anyRent = true;
        else errs[listingRoomRentKey(room.id)] = "Enter monthly rent for this room (use 0 only if not offered).";
      }
      if (!anyRent && sub.rooms.length > 0) {
        errs.monthlyRent = "Set monthly rent for at least one room.";
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
    if (sub.applicationFeeOtherEnabled && !sub.applicationFeeOtherInstructions?.trim()) {
      errs.applicationFeeOtherInstructions = "Enter payment instructions for the Other application fee option.";
    }
    const appFeeAmount = parseMoneyAmount(sub.applicationFee);
    if (appFeeAmount > 0) {
      const channels = listingApplicationFeeChannels(sub);
      if (!channels.ach && !channels.zelle && !channels.venmo && !channels.other) {
        errs.applicationFeeMethods = "Choose at least one application fee payment method.";
      }
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
