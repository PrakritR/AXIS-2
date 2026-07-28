import type { ManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";
import { isListingFeeAmountFilled } from "@/lib/manager-listing-submission";
import { shortTermNightlyRate } from "@/lib/short-term-stay-pricing";

/** Short-term fee rows that can be toggled independently in the unified Fees table. */
export type ListingStFeeToggleId = "rent" | "applicationFee" | "securityDeposit" | "moveInFee";

export type ListingStFeeToggles = Record<ListingStFeeToggleId, boolean>;

/** Standard fee rows shown in the unified Fees table (excluding custom fees). */
export type ListingStandardFeeRowId =
  | ListingStFeeToggleId
  | "holdingDeposit"
  | "parkingMonthly"
  | "hoaMonthly"
  | "otherMonthlyFees"
  | "monthToMonthSurcharge";

export const LISTING_STANDARD_FEE_ROWS: readonly {
  id: ListingStandardFeeRowId;
  label: string;
  stField?: keyof ManagerListingSubmissionV1;
  ltField?: keyof ManagerListingSubmissionV1;
  stHint?: string;
  ltHint?: string;
  ltRequiredWhenLongTerm?: boolean;
}[] = [
  {
    id: "rent",
    label: "Rent",
    stField: "shortTermDailyCost",
    ltField: "entireHomeMonthlyRent",
    stHint: "nightly → stay total",
    ltHint: "monthly",
  },
  {
    id: "applicationFee",
    label: "Application fee",
    stField: "applicationFee",
  },
  {
    id: "securityDeposit",
    label: "Security deposit",
    stField: "shortTermDeposit",
    ltField: "securityDeposit",
    ltRequiredWhenLongTerm: true,
  },
  {
    id: "moveInFee",
    label: "Move-in / cleaning",
    stField: "shortTermMoveInFee",
    ltField: "moveInFee",
    ltRequiredWhenLongTerm: true,
  },
  {
    id: "holdingDeposit",
    label: "Holding deposit",
    ltField: "holdingDeposit",
  },
  {
    id: "parkingMonthly",
    label: "Parking",
    ltField: "parkingMonthly",
    ltRequiredWhenLongTerm: true,
  },
  {
    id: "hoaMonthly",
    label: "HOA / community",
    ltField: "hoaMonthly",
    ltRequiredWhenLongTerm: true,
  },
  {
    id: "otherMonthlyFees",
    label: "Other monthly fees",
    ltField: "otherMonthlyFees",
    ltRequiredWhenLongTerm: true,
  },
  {
    id: "monthToMonthSurcharge",
    label: "Month-to-month surcharge",
    ltField: "monthToMonthSurcharge",
    ltRequiredWhenLongTerm: true,
  },
];

function stripMoneyDisplay(raw: unknown): string {
  return String(raw ?? "")
    .replace(/^\$/, "")
    .replace(/\/mo(nth)?\.?$/i, "")
    .trim();
}

/** Infer ST fee checkboxes from stored submission values (edit/resume). */
export function deriveListingStFeeToggles(
  sub: Pick<
    ManagerListingSubmissionV1,
    "shortTermDailyCost" | "applicationFee" | "shortTermDeposit" | "shortTermMoveInFee"
  >,
): ListingStFeeToggles {
  return {
    rent: isListingFeeAmountFilled(sub.shortTermDailyCost ?? ""),
    applicationFee: isListingFeeAmountFilled(sub.applicationFee ?? ""),
    securityDeposit: isListingFeeAmountFilled(sub.shortTermDeposit ?? ""),
    moveInFee: isListingFeeAmountFilled(sub.shortTermMoveInFee ?? ""),
  };
}

/** Read the string amount shown in a Fees-table cell. */
export function readListingFeeCellAmount(
  sub: ManagerListingSubmissionV1,
  field: keyof ManagerListingSubmissionV1 | undefined,
): string {
  if (!field) return "";
  if (field === "entireHomeMonthlyRent") {
    const n = sub.entireHomeMonthlyRent;
    return typeof n === "number" && n > 0 ? String(n) : "";
  }
  return stripMoneyDisplay(sub[field]);
}

/** Map ST/LT toggle + amount edits onto submission fields. */
export function applyListingStFeeToggle(
  sub: ManagerListingSubmissionV1,
  feeId: ListingStFeeToggleId,
  enabled: boolean,
): ManagerListingSubmissionV1 {
  const row = LISTING_STANDARD_FEE_ROWS.find((r) => r.id === feeId);
  if (!row?.stField) return sub;
  if (!enabled) {
    return { ...sub, [row.stField]: "" };
  }
  return sub;
}

export function applyListingLtFeeAmount(
  sub: ManagerListingSubmissionV1,
  field: keyof ManagerListingSubmissionV1,
  sanitizedAmount: string,
): ManagerListingSubmissionV1 {
  if (field === "entireHomeMonthlyRent") {
    const nextRent =
      sanitizedAmount === "" || sanitizedAmount === "."
        ? 0
        : Number.parseFloat(sanitizedAmount);
    return {
      ...sub,
      entireHomeMonthlyRent: Number.isFinite(nextRent) ? nextRent : 0,
    };
  }
  return { ...sub, [field]: sanitizedAmount };
}

export function applyListingStFeeAmount(
  sub: ManagerListingSubmissionV1,
  feeId: ListingStFeeToggleId,
  sanitizedAmount: string,
): ManagerListingSubmissionV1 {
  const row = LISTING_STANDARD_FEE_ROWS.find((r) => r.id === feeId);
  if (!row?.stField) return sub;
  return { ...sub, [row.stField]: sanitizedAmount };
}

/** Whether long-term fee fields must be filled (0 allowed) on the pricing step. */
export function listingLtFeeFieldsRequired(hasLongTerm: boolean): (keyof ManagerListingSubmissionV1)[] {
  if (!hasLongTerm) return [];
  return LISTING_STANDARD_FEE_ROWS.filter((r) => r.ltRequiredWhenLongTerm && r.ltField).map(
    (r) => r.ltField!,
  );
}

/** Validation helpers for ST fee toggles → submission fields. */
export function validateListingStFeeToggles(
  sub: ManagerListingSubmissionV1,
  toggles: ListingStFeeToggles,
  hasShortTerm: boolean,
): Record<string, string> {
  const errs: Record<string, string> = {};
  if (!hasShortTerm) return errs;

  if (toggles.rent) {
    if (!(shortTermNightlyRate(sub.shortTermDailyCost) > 0)) {
      errs.shortTermDailyCost = "Enter a nightly rate for short-term stays.";
    }
  }

  for (const row of LISTING_STANDARD_FEE_ROWS) {
    if (!row.stField || row.id === "rent") continue;
    const toggleId = row.id as ListingStFeeToggleId;
    if (!(toggleId in toggles) || !toggles[toggleId]) continue;
    const raw = String(sub[row.stField] ?? "");
    if (!isListingFeeAmountFilled(raw)) {
      errs[String(row.stField)] = `Enter an amount for ${row.label.toLowerCase()} (0 if none).`;
    }
  }

  return errs;
}
