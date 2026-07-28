import {
  type ManagerCustomFeeRow,
  type ManagerListingSubmissionV1,
  type PaymentAtSigningOptionId,
} from "@/lib/manager-listing-submission";
import { parseMoneyAmount } from "@/lib/parse-money";

/** Fee fields must be filled with a dollar amount; use 0 when there is no charge. */
export function isListingFeeAmountFilled(raw: string): boolean {
  const t = String(raw ?? "")
    .replace(/^\$/, "")
    .trim();
  if (!t) return false;
  if (/^waived$/i.test(t)) return false;
  if (!/[\d]/.test(t)) return false;
  const n = parseMoneyAmount(t);
  return Number.isFinite(n) && n >= 0;
}

/** Cadence for a listing fee row. `frequency` on stored rows is kept in sync for older readers. */
export type ListingFeeCadence = "one-time" | "monthly" | "nightly";

/** Built-in fee slots — custom rows use presetId `custom`. */
export type ListingFeePresetId =
  | "holding_deposit"
  | "security_deposit"
  | "move_in_fee"
  | "parking_monthly"
  | "hoa_monthly"
  | "other_monthly"
  | "mtm_surcharge"
  | "short_term_nightly"
  | "short_term_deposit"
  | "short_term_move_in";

export type ListingFeeRow = ManagerCustomFeeRow & {
  cadence?: ListingFeeCadence;
  presetId?: ListingFeePresetId | "custom";
  dueAtSigning?: boolean;
  shortTermOnly?: boolean;
  creditsTowardSecurity?: boolean;
};

export type ListingFeePresetMeta = {
  presetId: ListingFeePresetId;
  defaultLabel: string;
  cadence: ListingFeeCadence;
  dueAtSigning?: boolean;
  shortTermOnly?: boolean;
  creditsTowardSecurity?: boolean;
  /** When true, wizard validation requires a filled amount (0 allowed). */
  requiredInWizard?: boolean;
  /** Shown when short-term stays are enabled on the listing. */
  shortTermSection?: boolean;
};

export const LISTING_FEE_PRESETS: readonly ListingFeePresetMeta[] = [
  {
    presetId: "holding_deposit",
    defaultLabel: "Holding deposit",
    cadence: "one-time",
    creditsTowardSecurity: true,
    requiredInWizard: false,
  },
  {
    presetId: "security_deposit",
    defaultLabel: "Security deposit",
    cadence: "one-time",
    dueAtSigning: true,
    requiredInWizard: true,
  },
  {
    presetId: "move_in_fee",
    defaultLabel: "Move-in fee",
    cadence: "one-time",
    dueAtSigning: true,
    requiredInWizard: true,
  },
  {
    presetId: "parking_monthly",
    defaultLabel: "Parking",
    cadence: "monthly",
    requiredInWizard: true,
  },
  {
    presetId: "hoa_monthly",
    defaultLabel: "HOA / community",
    cadence: "monthly",
    requiredInWizard: true,
  },
  {
    presetId: "other_monthly",
    defaultLabel: "Other monthly fees",
    cadence: "monthly",
    requiredInWizard: true,
  },
  {
    presetId: "mtm_surcharge",
    defaultLabel: "Month-to-month surcharge",
    cadence: "monthly",
    requiredInWizard: true,
  },
  {
    presetId: "short_term_nightly",
    defaultLabel: "Short-term nightly rate",
    cadence: "nightly",
    shortTermOnly: true,
    shortTermSection: true,
  },
  {
    presetId: "short_term_deposit",
    defaultLabel: "Short-term deposit",
    cadence: "one-time",
    shortTermOnly: true,
    shortTermSection: true,
  },
  {
    presetId: "short_term_move_in",
    defaultLabel: "Short-term move-in fee",
    cadence: "one-time",
    shortTermOnly: true,
    shortTermSection: true,
  },
] as const;

const PRESET_BY_ID = new Map<ListingFeePresetId, ListingFeePresetMeta>(
  LISTING_FEE_PRESETS.map((p) => [p.presetId, p]),
);

export const CORE_LISTING_FEE_PRESET_IDS: ListingFeePresetId[] = LISTING_FEE_PRESETS.filter(
  (p) => !p.shortTermSection,
).map((p) => p.presetId);

export function listingFeeWizardFieldKey(feeId: string): string {
  return `listing-fee-${feeId}`;
}

export function listingFeeCadence(row: Pick<ListingFeeRow, "cadence" | "frequency">): ListingFeeCadence {
  if (row.cadence === "one-time" || row.cadence === "monthly" || row.cadence === "nightly") return row.cadence;
  return row.frequency === "one-time" ? "one-time" : "monthly";
}

function cadenceToLegacyFrequency(cadence: ListingFeeCadence): "one-time" | "monthly" {
  return cadence === "monthly" ? "monthly" : "one-time";
}

function rid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Rows saved before fee rows carried preset metadata were stripped to
 * {id,label,amount,frequency}, so they come back untagged and look "custom"
 * even though they ARE the preset fee. Re-tagging them by their label is what
 * stops a listing showing "Security deposit" twice — once as the standard row
 * and again as a custom one — and is what lets the standard row find its
 * cadence.
 */
const PRESET_ID_BY_DEFAULT_LABEL = new Map<string, ListingFeePresetId>(
  LISTING_FEE_PRESETS.map((p) => [p.defaultLabel.trim().toLowerCase(), p.presetId]),
);

function recoverPresetIdFromLabel(label: unknown): ListingFeePresetId | undefined {
  if (typeof label !== "string") return undefined;
  return PRESET_ID_BY_DEFAULT_LABEL.get(label.trim().toLowerCase());
}

export function normalizeListingFeeRow(raw: ListingFeeRow): ListingFeeRow {
  const row = raw;
  const cadence = listingFeeCadence(row);
  const resolvedPresetId =
    row.presetId && row.presetId !== "custom" ? row.presetId : recoverPresetIdFromLabel(row.label);
  const preset = resolvedPresetId ? PRESET_BY_ID.get(resolvedPresetId) : undefined;
  return {
    id: row.id || rid("fee"),
    label: typeof row.label === "string" ? row.label.trim() : preset?.defaultLabel ?? "",
    amount: typeof row.amount === "string" ? row.amount.trim() : "",
    cadence,
    frequency: cadenceToLegacyFrequency(cadence === "nightly" ? "one-time" : cadence),
    presetId: resolvedPresetId ?? "custom",
    dueAtSigning: row.dueAtSigning ?? preset?.dueAtSigning ?? false,
    shortTermOnly: row.shortTermOnly ?? preset?.shortTermOnly ?? false,
    creditsTowardSecurity: row.creditsTowardSecurity ?? preset?.creditsTowardSecurity ?? false,
    // Preserve the optional per-fee short-term amount (custom-fee short-term billing) — the
    // literal below would otherwise drop it, unbilling a fee the manager set for short-term.
    shortTermAmount:
      typeof row.shortTermAmount === "string" && row.shortTermAmount.trim()
        ? row.shortTermAmount.trim()
        : undefined,
  };
}

export function emptyCustomListingFeeRow(): ListingFeeRow {
  return normalizeListingFeeRow({
    id: rid("fee"),
    label: "",
    amount: "",
    frequency: "monthly",
    cadence: "monthly",
    presetId: "custom",
  });
}

export function presetListingFeeRow(presetId: ListingFeePresetId, amount = ""): ListingFeeRow {
  const meta = PRESET_BY_ID.get(presetId);
  if (!meta) return emptyCustomListingFeeRow();
  return normalizeListingFeeRow({
    id: rid("fee"),
    label: meta.defaultLabel,
    amount,
    cadence: meta.cadence,
    frequency: cadenceToLegacyFrequency(meta.cadence === "nightly" ? "one-time" : meta.cadence),
    presetId,
    dueAtSigning: meta.dueAtSigning,
    shortTermOnly: meta.shortTermOnly,
    creditsTowardSecurity: meta.creditsTowardSecurity,
  });
}

/** Default fee rows for a new listing wizard (long-term core fees only). */
export function defaultCoreListingFeeRows(): ListingFeeRow[] {
  return CORE_LISTING_FEE_PRESET_IDS.map((presetId) => {
    const amount = presetId === "holding_deposit" ? "100" : "";
    return presetListingFeeRow(presetId, amount);
  });
}

export function shortTermListingFeeRows(): ListingFeeRow[] {
  return LISTING_FEE_PRESETS.filter((p) => p.shortTermSection).map((p) => presetListingFeeRow(p.presetId, ""));
}

function feeAmountForPreset(fees: ListingFeeRow[], presetId: ListingFeePresetId): string {
  return fees.find((f) => f.presetId === presetId)?.amount ?? "";
}

/** Dual-write legacy scalar fields so existing charge / display code keeps working. */
export function legacyListingAmountsFromFees(fees: ListingFeeRow[]): Pick<
  ManagerListingSubmissionV1,
  | "holdingDeposit"
  | "securityDeposit"
  | "moveInFee"
  | "parkingMonthly"
  | "hoaMonthly"
  | "otherMonthlyFees"
  | "monthToMonthSurcharge"
  | "shortTermDailyCost"
  | "shortTermDeposit"
  | "shortTermMoveInFee"
> {
  const holding = feeAmountForPreset(fees, "holding_deposit");
  return {
    holdingDeposit: holding ? (holding.startsWith("$") ? holding : `$${holding}`) : "",
    securityDeposit: feeAmountForPreset(fees, "security_deposit"),
    moveInFee: feeAmountForPreset(fees, "move_in_fee"),
    parkingMonthly: feeAmountForPreset(fees, "parking_monthly"),
    hoaMonthly: feeAmountForPreset(fees, "hoa_monthly"),
    otherMonthlyFees: feeAmountForPreset(fees, "other_monthly"),
    monthToMonthSurcharge: feeAmountForPreset(fees, "mtm_surcharge"),
    shortTermDailyCost: feeAmountForPreset(fees, "short_term_nightly"),
    shortTermDeposit: feeAmountForPreset(fees, "short_term_deposit"),
    shortTermMoveInFee: feeAmountForPreset(fees, "short_term_move_in"),
  };
}

/** Build unified fee rows from legacy scalar fields (older saved submissions). */
export function listingFeesFromLegacyScalars(
  sub: Pick<
    ManagerListingSubmissionV1,
    | "holdingDeposit"
    | "securityDeposit"
    | "moveInFee"
    | "parkingMonthly"
    | "hoaMonthly"
    | "otherMonthlyFees"
    | "monthToMonthSurcharge"
    | "shortTermDailyCost"
    | "shortTermDeposit"
    | "shortTermMoveInFee"
    | "paymentAtSigningIncludes"
  >,
): ListingFeeRow[] {
  const dueSecurity = sub.paymentAtSigningIncludes?.includes("security_deposit") ?? true;
  const dueMoveIn = sub.paymentAtSigningIncludes?.includes("move_in_fee") ?? true;

  const core = CORE_LISTING_FEE_PRESET_IDS.map((presetId) => {
    const row = presetListingFeeRow(presetId, "");
    switch (presetId) {
      case "holding_deposit":
        row.amount = (sub.holdingDeposit ?? "").replace(/^\$/, "").trim();
        break;
      case "security_deposit":
        row.amount = (sub.securityDeposit ?? "").replace(/^\$/, "").trim();
        row.dueAtSigning = dueSecurity;
        break;
      case "move_in_fee":
        row.amount = (sub.moveInFee ?? "").replace(/^\$/, "").trim();
        row.dueAtSigning = dueMoveIn;
        break;
      case "parking_monthly":
        row.amount = (sub.parkingMonthly ?? "").replace(/^\$/, "").trim();
        break;
      case "hoa_monthly":
        row.amount = (sub.hoaMonthly ?? "").replace(/^\$/, "").trim();
        break;
      case "other_monthly":
        row.amount = (sub.otherMonthlyFees ?? "").replace(/^\$/, "").trim();
        break;
      case "mtm_surcharge":
        row.amount = (sub.monthToMonthSurcharge ?? "").replace(/^\$/, "").trim();
        break;
      default:
        break;
    }
    return normalizeListingFeeRow(row);
  });

  const shortTerm = shortTermListingFeeRows().map((row) => {
    const next = { ...row };
    if (row.presetId === "short_term_nightly") next.amount = (sub.shortTermDailyCost ?? "").replace(/^\$/, "").trim();
    if (row.presetId === "short_term_deposit") next.amount = (sub.shortTermDeposit ?? "").replace(/^\$/, "").trim();
    if (row.presetId === "short_term_move_in") next.amount = (sub.shortTermMoveInFee ?? "").replace(/^\$/, "").trim();
    return normalizeListingFeeRow(next);
  });

  return [...core, ...shortTerm];
}

export function submissionUsesUnifiedListingFees(customFees: ManagerCustomFeeRow[] | undefined): boolean {
  if (!Array.isArray(customFees) || customFees.length === 0) return false;
  return customFees.some((f) => {
    const pid = (f as ListingFeeRow).presetId;
    return pid && pid !== "custom";
  });
}

/** Merge preset rows, custom rows, and legacy scalars into one canonical fee list. */
export function resolveListingFees(
  sub: Pick<
    ManagerListingSubmissionV1,
    | "customFees"
    | "holdingDeposit"
    | "securityDeposit"
    | "moveInFee"
    | "parkingMonthly"
    | "hoaMonthly"
    | "otherMonthlyFees"
    | "monthToMonthSurcharge"
    | "shortTermDailyCost"
    | "shortTermDeposit"
    | "shortTermMoveInFee"
    | "paymentAtSigningIncludes"
    | "shortTermRentalsAllowed"
  >,
): ListingFeeRow[] {
  const fromLegacy = listingFeesFromLegacyScalars(sub);
  if (!submissionUsesUnifiedListingFees(sub.customFees)) {
    const customs = (sub.customFees ?? []).map(normalizeListingFeeRow).filter((f) => f.presetId === "custom" || !f.presetId);
    return [...fromLegacy, ...customs];
  }

  const normalized = (sub.customFees ?? []).map(normalizeListingFeeRow);
  const byPreset = new Map<ListingFeePresetId, ListingFeeRow>();
  const customs: ListingFeeRow[] = [];

  for (const row of normalized) {
    if (row.presetId && row.presetId !== "custom") {
      byPreset.set(row.presetId, row);
    } else {
      customs.push(row);
    }
  }

  const mergedPresets = fromLegacy.map((legacyRow) => {
    const presetId = legacyRow.presetId as ListingFeePresetId;
    const fromFees = byPreset.get(presetId);
    if (!fromFees) return legacyRow;
    const amount = fromFees.amount.trim() ? fromFees.amount : legacyRow.amount;
    return normalizeListingFeeRow({ ...fromFees, amount });
  });

  return [...mergedPresets, ...customs];
}

export function listingFeesForWizard(
  sub: Pick<
    ManagerListingSubmissionV1,
    | "customFees"
    | "holdingDeposit"
    | "securityDeposit"
    | "moveInFee"
    | "parkingMonthly"
    | "hoaMonthly"
    | "otherMonthlyFees"
    | "monthToMonthSurcharge"
    | "shortTermDailyCost"
    | "shortTermDeposit"
    | "shortTermMoveInFee"
    | "paymentAtSigningIncludes"
    | "shortTermRentalsAllowed"
  >,
): ListingFeeRow[] {
  const all = resolveListingFees(sub);
  const shortTermOn = Boolean(sub.shortTermRentalsAllowed);
  return all.filter((f) => {
    if (f.shortTermOnly && !shortTermOn) return false;
    if (f.presetId === "custom") return true;
    if (f.presetId) {
      const meta = PRESET_BY_ID.get(f.presetId);
      if (meta?.shortTermSection && !shortTermOn) return false;
    }
    return true;
  });
}

export function derivePaymentAtSigningIncludes(
  current: PaymentAtSigningOptionId[] | undefined,
  fees: ListingFeeRow[],
): PaymentAtSigningOptionId[] {
  const keepRent = current?.includes("first_month_rent") ?? false;
  const keepUtils = current?.includes("first_month_utilities") ?? false;
  const next: PaymentAtSigningOptionId[] = [];
  const security = fees.find((f) => f.presetId === "security_deposit");
  const moveIn = fees.find((f) => f.presetId === "move_in_fee");
  if (security?.dueAtSigning) next.push("security_deposit");
  if (moveIn?.dueAtSigning) next.push("move_in_fee");
  if (keepRent) next.push("first_month_rent");
  if (keepUtils) next.push("first_month_utilities");
  if (next.length === 0) return ["security_deposit", "move_in_fee"];
  return next;
}

/** Apply fee list to submission — updates customFees and legacy scalars. */
export function applyListingFeesToSubmission(
  sub: ManagerListingSubmissionV1,
  fees: ListingFeeRow[],
): ManagerListingSubmissionV1 {
  const normalized = fees.map(normalizeListingFeeRow);
  const legacy = legacyListingAmountsFromFees(normalized);
  const paymentAtSigningIncludes = derivePaymentAtSigningIncludes(sub.paymentAtSigningIncludes, normalized);
  return {
    ...sub,
    ...legacy,
    customFees: normalized,
    paymentAtSigningIncludes,
  };
}

/** Ensure submission has unified fees + legacy fields in sync (call from normalize). */
export function ensureSubmissionListingFees(sub: ManagerListingSubmissionV1): ManagerListingSubmissionV1 {
  let fees = resolveListingFees(sub);
  if (!submissionUsesUnifiedListingFees(sub.customFees)) {
    const customs = (sub.customFees ?? []).map(normalizeListingFeeRow).filter((f) => !f.presetId || f.presetId === "custom");
    fees = [...fees.filter((f) => f.presetId !== "custom"), ...customs];
  }
  return applyListingFeesToSubmission(sub, fees);
}

export function validateListingFeeRows(
  fees: ListingFeeRow[],
  opts: { shortTermRentalsAllowed?: boolean } = {},
): Record<string, string> {
  const errs: Record<string, string> = {};
  const shortTermOn = Boolean(opts.shortTermRentalsAllowed);

  for (const row of fees) {
    if (row.presetId === "custom") {
      const hasLabel = row.label.trim().length > 0;
      const hasAmount = isListingFeeAmountFilled(row.amount);
      if (hasLabel && !hasAmount) {
        errs[listingFeeWizardFieldKey(row.id)] = "Enter an amount or remove this fee.";
      }
      if (hasAmount && !hasLabel) {
        errs[listingFeeWizardFieldKey(row.id)] = "Name this fee.";
      }
      continue;
    }

    if (!row.presetId) continue;
    const meta = PRESET_BY_ID.get(row.presetId);
    if (!meta) continue;
    if (meta.shortTermSection && !shortTermOn) continue;

    if (meta.requiredInWizard && !isListingFeeAmountFilled(row.amount)) {
      const legacyKey = legacyFieldKeyForPreset(row.presetId);
      const msg = `${meta.defaultLabel} is required — enter 0 if there is no fee.`;
      errs[listingFeeWizardFieldKey(row.id)] = msg;
      if (legacyKey) errs[legacyKey] = msg;
    }
  }

  return errs;
}

function legacyFieldKeyForPreset(presetId: ListingFeePresetId): keyof ManagerListingSubmissionV1 | null {
  switch (presetId) {
    case "security_deposit":
      return "securityDeposit";
    case "move_in_fee":
      return "moveInFee";
    case "parking_monthly":
      return "parkingMonthly";
    case "hoa_monthly":
      return "hoaMonthly";
    case "other_monthly":
      return "otherMonthlyFees";
    case "mtm_surcharge":
      return "monthToMonthSurcharge";
    default:
      return null;
  }
}

export function feeMeaningfulForPublicListing(amount: string): boolean {
  const n = parseMoneyAmount(amount);
  return n > 0;
}

export type ListingFeeDisplayRow = {
  id: string;
  title: string;
  price: string;
  status: string;
  detail: string;
  body: string;
  icon: string;
};

/** Public listing house-cost rows from unified fees (skips zero amounts and duplicate presets). */
export function listingFeeDisplayRows(
  sub: ManagerListingSubmissionV1,
  formatPrice: (raw: string) => string,
): ListingFeeDisplayRow[] {
  const fees = resolveListingFees(sub).filter((f) => feeMeaningfulForPublicListing(f.amount));
  const shortTermOn = Boolean(sub.shortTermRentalsAllowed);
  const rows: ListingFeeDisplayRow[] = [];

  for (const fee of fees) {
    if (fee.shortTermOnly && !shortTermOn) continue;
    const cadence = listingFeeCadence(fee);
    const price = formatPrice(fee.amount);
    const title = fee.label.trim() || PRESET_BY_ID.get(fee.presetId as ListingFeePresetId)?.defaultLabel || "Fee";
    if (fee.presetId === "holding_deposit") {
      rows.push({
        id: "holding-deposit",
        icon: "🤝",
        title,
        detail: "Credits toward security deposit",
        price,
        status: "One-time",
        body: `${title}: ${price} (one-time, credited toward security deposit when you are approved).`,
      });
      continue;
    }
    if (fee.presetId === "parking_monthly") {
      rows.push({
        id: "parking",
        icon: "🅿️",
        title: "Parking",
        detail: "If applicable",
        price,
        status: "Monthly",
        body: `Parking: ${price} per month.`,
      });
      continue;
    }
    if (fee.presetId === "hoa_monthly") {
      rows.push({
        id: "hoa",
        icon: "🏛️",
        title: "HOA / community",
        detail: "If applicable",
        price,
        status: "Monthly",
        body: `HOA or community fee: ${price}.`,
      });
      continue;
    }
    if (fee.presetId === "other_monthly") {
      rows.push({
        id: "other-fees",
        icon: "➕",
        title: "Other fees",
        detail: "As submitted",
        price,
        status: "See notes",
        body: price,
      });
      continue;
    }
    if (fee.presetId === "mtm_surcharge") {
      rows.push({
        id: "mtm-surcharge",
        icon: "📅",
        title: title,
        detail: "Month-to-month leases",
        price,
        status: "Monthly",
        body: `${title}: ${price} per month when on month-to-month.`,
      });
      continue;
    }

    const status =
      cadence === "nightly" ? "Nightly" : cadence === "monthly" ? "Monthly" : fee.dueAtSigning ? "At signing" : "One-time";
    rows.push({
      id: `fee-${fee.id}`,
      icon: "💵",
      title,
      detail: cadence === "nightly" ? "Short-term stays" : cadence === "monthly" ? "Additional monthly charge" : "One-time charge",
      price: cadence === "nightly" ? `${price}/night` : price,
      status,
      body:
        cadence === "nightly"
          ? `${title}: ${price} per night.`
          : cadence === "monthly"
            ? `${title}: ${price} per month.`
            : `${title}: ${price} (one-time).`,
    });
  }

  return rows;
}

export function cadenceLabel(cadence: ListingFeeCadence): string {
  if (cadence === "one-time") return "One-time";
  if (cadence === "nightly") return "Nightly";
  return "Monthly";
}


export function withShortTermListingFees(sub: ManagerListingSubmissionV1, enabled: boolean): ManagerListingSubmissionV1 {
  if (!enabled) return sub;
  const fees = resolveListingFees(sub);
  const present = new Set(fees.map((f) => f.presetId));
  const toAdd = shortTermListingFeeRows().filter((row) => row.presetId && !present.has(row.presetId));
  if (toAdd.length === 0) return sub;
  return applyListingFeesToSubmission(sub, [...fees, ...toAdd]);
}
