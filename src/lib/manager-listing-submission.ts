/** Full manager “add listing” payload — drives generated listing detail page (localStorage-backed). */

import {
  LISTING_PLACE_CATEGORY_OPTIONS,
  LISTING_PROPERTY_TYPE_OPTIONS,
  LISTING_STORIES_OPTIONS,
  LISTING_TOTAL_BATH_OPTIONS,
  type SharedSpaceKind,
  inferSharedSpaceKind,
  normalizeSharedSpaceKind,
} from "@/data/manager-listing-presets";
import { LEASE_TERM_OPTIONS } from "@/lib/rental-application/lease-terms";
import { RENTAL_APPLICATION_SECTION_IDS } from "@/lib/rental-application/application-sections";
import { parseMoneyAmount } from "@/lib/parse-money";
import type { UtilitiesPaymentModel } from "@/lib/listing-utilities-payment";
import { normalizeUtilitiesPaymentModel } from "@/lib/listing-utilities-payment";

export type PaymentAtSigningOptionId =
  | "security_deposit"
  | "move_in_fee"
  | "first_month_rent"
  | "first_month_utilities";

export const PAYMENT_AT_SIGNING_OPTIONS: readonly { id: PaymentAtSigningOptionId; label: string }[] = [
  { id: "security_deposit", label: "Security deposit" },
  { id: "move_in_fee", label: "Move-in fee" },
  { id: "first_month_rent", label: "First month rent" },
  { id: "first_month_utilities", label: "First month utilities" },
];

export type ManagerRoomUnavailableRange = {
  id: string;
  /** Inclusive YYYY-MM-DD — room cannot be leased overlapping this span. */
  start: string;
  /** Inclusive YYYY-MM-DD */
  end: string;
};

export type ManagerRoomSubmission = {
  id: string;
  name: string;
  floor: string;
  monthlyRent: number;
  availability: string;
  /** Earliest date this room can be occupied (YYYY-MM-DD). Required for new listings. */
  moveInAvailableDate: string;
  /** Keys, parking, access, what to bring — shown to placed residents. Required for new listings. */
  moveInInstructions: string;
  /** Manager-defined blocks when the room must not be booked (overlaps disallowed with applicant lease). */
  manualUnavailableRanges: ManagerRoomUnavailableRange[];
  detail: string;
  /** Furnishing level or what is included (shown on listing). */
  furnishing: string;
  /** Room-level amenities (lines or comma-separated), shown as chips on the listing. */
  roomAmenitiesText: string;
  photoDataUrls: string[];
  videoDataUrl: string | null;
  /** Estimated monthly utilities for this room (shown on listing). */
  utilitiesEstimate: string;
  /** Who pays utilities — defaults to manager-billed estimate through the portal. */
  utilitiesPaymentModel?: UtilitiesPaymentModel;
  /** How prorated first-month rent is calculated. "auto" = (days_remaining / days_in_month) × monthly rate. "daily_rate" = days_remaining × set daily rate. Defaults to "auto" when absent. */
  prorateMethod?: "auto" | "daily_rate";
  /** Daily rent rate used when prorateMethod is "daily_rate". */
  dailyRentRate?: number;
  /** Daily utilities rate used when prorateMethod is "daily_rate". */
  dailyUtilitiesRate?: number;
  /**
   * Which rate is this room's HEADLINE price and billing basis. Absent or "monthly"
   * → the room is priced monthly and behaves exactly as it always has (monthlyRent
   * drives display and every charge). "daily" → the room is priced by the day at
   * {@link dailyRentPrice}: the listing shows "$X/day" and every rent charge (first
   * month, each recurring month, and the last month) is billed as billable-days ×
   * dailyRentPrice using the room's actual day counts.
   *
   * This is DISTINCT from {@link prorateMethod}/{@link dailyRentRate} (which only
   * prorate the partial edge months of a monthly-priced room) and from
   * shortTermDailyCost (nightly short-term stays). A room may store both a monthly
   * rent and a daily price; rentBasis is the single tiebreaker for which one is
   * active. Daily NEVER overrides monthly unless the manager explicitly sets
   * rentBasis = "daily", so no existing (monthly) room is affected.
   */
  rentBasis?: "monthly" | "daily";
  /** Headline daily rent rate (USD dollars) used when rentBasis is "daily". */
  dailyRentPrice?: number;
};

/** Sidebar “Quick facts” rows on the public listing; when empty, facts are auto-derived from the submission. */
export type ManagerQuickFactRow = {
  id: string;
  label: string;
  value: string;
};

/** Optional extra fees beyond the standard application / deposit / parking fields. */
export type ManagerCustomFeeRow = {
  id: string;
  label: string;
  amount: string;
  /** Default monthly when unset. */
  frequency?: "one-time" | "monthly";
};

/** Rows for the public “Bundles & leasing” table (optional — defaults are generated from rooms). */
export type ManagerBundleRow = {
  id: string;
  label: string;
  /** e.g. from $899/mo or $950/mo */
  price: string;
  strikethrough: string;
  /** Shown as “offer” / promo line when set */
  promo: string;
  /** Secondary line under the bundle name — optional manual override when rooms are picked. */
  roomsLine: string;
  /** Rooms included in this bundle (scope line auto-built from names when set). */
  includedRoomIds?: string[];
};

/** How a room uses a specific bathroom row (optional; improves listing copy). */
export type ManagerBathroomRoomAccessKind = "ensuite" | "shared" | "hall";

export type ManagerBathroomSubmission = {
  id: string;
  name: string;
  location: string;
  /** Extra finishes & fixtures for this bathroom (preset lines + free text). */
  amenitiesText: string;
  /** Uploaded bathroom photos shown in listing details. */
  photoDataUrls: string[];
  /** Optional bathroom video shown in listing details. */
  videoDataUrl?: string | null;
  shower: boolean;
  toilet: boolean;
  bathtub: boolean;
  /**
   * Which rooms use this bathroom. Exclusive across bathrooms that are **not** `allResidents`
   * (a listed room should appear on at most one of those rows).
   */
  assignedRoomIds: string[];
  /**
   * Hall / whole-house bath everyone shares — no per-room checkboxes; listing shows all bedrooms.
   * Does not claim room ids, so rooms can still be assigned to their suite / shared bath rows.
   */
  allResidents?: boolean;
  /** Optional per-room situation for this bathroom (only meaningful when the room is checked). */
  accessKindByRoomId?: Partial<Record<string, ManagerBathroomRoomAccessKind>>;
};

export type ManagerSharedSpaceSubmission = {
  id: string;
  /** Short label on the listing (e.g. Kitchen, Laundry room). */
  name: string;
  /** Drives which amenity presets appear for this row (kitchen vs laundry vs outdoor, etc.). */
  spaceKind?: SharedSpaceKind;
  /** Where this shared space is in the home. */
  location: string;
  /** Longer description / rules / hours. */
  detail: string;
  /** Equipment & finishes for this space only (e.g. kitchen appliances). Preset lines + free text. */
  amenitiesText: string;
  /** Uploaded shared-space photos shown in listing details. */
  photoDataUrls: string[];
  /** Optional shared-space video shown in listing details. */
  videoDataUrl?: string | null;
  /** Rooms with access (same room may have access to multiple shared spaces). */
  roomAccessIds: string[];
};

export type ManagerListingSubmissionV1 = {
  v: 1;
  buildingName: string;
  address: string;
  zip: string;
  neighborhood: string;
  /** Free text: stories, floor count, unit type (e.g. “3-story townhouse”). Show in sidebar when set. */
  homeStructureNote: string;
  /** Structured basics (create-listing wizard). Fills quick facts when `homeStructureNote` is empty. */
  listingPropertyTypeId?: string;
  listingPlaceCategoryId?: string;
  /** When listingPlaceCategoryId is entire_home — one monthly lease for the full unit (USD). */
  entireHomeMonthlyRent?: number;
  /** Entire-home monthly utilities estimate (synced to first bedroom for signing math). */
  entireHomeUtilitiesEstimate?: string;
  /** How utilities are paid for an entire-home lease. */
  entireHomeUtilitiesPaymentModel?: UtilitiesPaymentModel;
  entireHomeProrateMethod?: "auto" | "daily_rate";
  entireHomeDailyRentRate?: number;
  entireHomeDailyUtilitiesRate?: number;
  listingStoriesId?: string;
  listingTotalBathroomsId?: string;
  /** Rentable bedroom slots — synced to `rooms.length` when leaving the home step. */
  listingBedroomSlots?: number;
  tagline: string;
  petFriendly: boolean;
  /** Long-form house / coliving description shown on listing */
  houseOverview: string;
  /** Quiet hours, guests, smoking, shared spaces — shown on House rules tab */
  houseRulesText: string;
  /** Manager-only internal notes about the house (not shown to residents). */
  houseDescription?: string;
  /** Resident-only general house info (codes, tips) — shown in resident portal move-in only. */
  generalHouseInfo?: string;
  /** Wi-Fi network name (SSID) — shown to placed residents on Move-in only. */
  wifiNetworkName?: string;
  /** Wi-Fi password — shown to placed residents on Move-in only. */
  wifiPassword?: string;
  /** Earliest move-in for entire-home listings (YYYY-MM-DD). */
  houseMoveInAvailableDate?: string;
  /** Move-in instructions for entire-home listings (keys, parking, access). */
  houseMoveInInstructions?: string;
  /** General house photos (common areas, exterior, kitchen) shown at the top of the public listing. */
  housePhotoDataUrls: string[];
  /**
   * Floor plan images keyed by floor / level label (matches `ManagerRoomSubmission.floor`).
   * Shown when residents tap Details on a floor plan row.
   */
  floorPlanByLabel?: Record<string, string>;
  /** Optional single floor plan for the whole property when floors are not split. */
  propertyFloorPlanDataUrl?: string | null;
  /** Optional full-house walkthrough video shown on the public listing. */
  houseVideoDataUrl?: string | null;
  /** Lease lengths offered on this listing (checkbox selections on Pricing step). */
  allowedLeaseTerms?: string[];
  /** Display copy derived from `allowedLeaseTerms`; kept for older listings and generated lease text. */
  leaseTermsBody: string;
  shortTermRentalsAllowed?: boolean;
  shortTermRequirements?: string;
  shortTermDailyCost?: string;
  shortTermDeposit?: string;
  /** Move-in fee charged for short-term stays (used to calculate upgrade delta when switching to long-term). */
  shortTermMoveInFee?: string;
  applicationFee: string;
  /** When true, residents may apply to additional properties or rooms beyond their first application. */
  allowMultiplePropertyApplications?: boolean;
  /**
   * When true, the application fee is only collected on the resident's first application
   * (subsequent applications skip the fee step).
   */
  applicationFeeOnlyFirstApplication?: boolean;
  securityDeposit: string;
  moveInFee: string;
  /** Charges included in “payment due at signing” (multi-select). */
  paymentAtSigningIncludes: PaymentAtSigningOptionId[];
  houseCostsDetail: string;
  parkingMonthly: string;
  hoaMonthly: string;
  otherMonthlyFees: string;
  /** Extra monthly charge added automatically when tenant is on month-to-month (e.g. $25). */
  monthToMonthSurcharge?: string;
  /** Manager-defined fees beyond the standard fields (shown on the listing). */
  customFees?: ManagerCustomFeeRow[];
  sharedSpaces: ManagerSharedSpaceSubmission[];
  /** One amenity per line or comma-separated */
  amenitiesText: string;
  /** When true, applicants/residents see Zelle instructions using `zelleContact`. */
  zellePaymentsEnabled?: boolean;
  /** Phone or email for Zelle (shown to applicants; manager marks payments paid manually). */
  zelleContact?: string;
  /** When true, applicants/residents see Venmo instructions using `venmoContact`. */
  venmoPaymentsEnabled?: boolean;
  /** Venmo username, phone, or email (shown to applicants; manager marks payments paid manually). */
  venmoContact?: string;
  /** When true, applicants/residents see a direct bank/ACH payment link using `achPaymentLink`. */
  achPaymentLinkEnabled?: boolean;
  /** External bank/ACH payment link (e.g. a bank bill-pay URL), shown to applicants/residents. */
  achPaymentLink?: string;
  /**
   * Payment methods this property accepts from residents, manager-controlled (Zelle/Venmo/ACH/Credit
   * card). Unset/empty = every method is accepted (see `acceptedPaymentMethodsForListing`). Read by the
   * resident's "Set payment method" selector to gate which choices are offered.
   */
  acceptedPaymentMethods?: ("zelle" | "venmo" | "ach" | "card")[];
  /**
   * When manual payment methods are enabled for the listing, applicants can still use the default “portal / online” path
   * for the application fee (manager marks received). Default true.
   */
  applicationFeeStripeEnabled?: boolean;
  /**
   * When Zelle is enabled, offer Zelle as an application-fee payment path in the apply flow.
   * Default true when Zelle is on; ignored when Zelle is off.
   */
  applicationFeeZelleEnabled?: boolean;
  /**
   * When Venmo is enabled, offer Venmo as an application-fee payment path in the apply flow.
   * Default true when Venmo is on; ignored when Venmo is off.
   */
  applicationFeeVenmoEnabled?: boolean;
  /** When true, offer a custom application-fee payment path using `applicationFeeOtherInstructions`. */
  applicationFeeOtherEnabled?: boolean;
  /** Instructions shown when applicant pays application fee via "Other". */
  applicationFeeOtherInstructions?: string;
  /** When monthly rent and utilities are due each cycle. Default first of month. */
  rentDueDayMode?: "first_of_month" | "last_of_month";
  /** Automatically assess a late fee after grace period on overdue rent/utilities. Default on. */
  lateFeeEnabled?: boolean;
  /** Days after due date before a late fee charge is created. Default 5. */
  lateFeeGraceDays?: number;
  /** Flat late fee amount (e.g. "50" or "$50"). Default $50. */
  lateFeeAmount?: string;
  /** When true, residents can pay rent via Axis ACH (low platform fee). Default true. */
  axisPaymentsEnabled?: boolean;
  rooms: ManagerRoomSubmission[];
  bathrooms: ManagerBathroomSubmission[];
  /** Optional bundle rows for the listing; if empty, copy is derived from rooms. */
  bundles: ManagerBundleRow[];
  /** Optional sidebar quick facts; when empty, listing derives defaults from submission. */
  quickFacts: ManagerQuickFactRow[];
  /** Resident-facing service request options for this property. */
  serviceRequestOptions?: ManagerListingServiceOption[];
  /** Manager-defined application questions applicants answer for this listing (array order is display order). */
  customApplicationFields?: ManagerCustomApplicationField[];
  /** Built-in application questions the manager removed for this listing. */
  disabledStandardApplicationKeys?: string[];
  /**
   * How the rental application is configured for this property.
   * "standard" = default Axis application only (custom questions kept but inactive);
   * "custom" = custom questions apply. Absent (legacy) = custom questions apply if present.
   */
  applicationConfigMode?: "standard" | "custom";
  /**
   * How the lease document is produced for this property.
   * "standard"/absent = Axis generated lease (current behavior);
   * "custom" = manager's custom lease terms or uploaded template (see `leaseCustomKind`).
   */
  leaseConfigMode?: "standard" | "custom";
  /** Which custom lease source applies when `leaseConfigMode` is "custom". Default "terms". */
  leaseCustomKind?: "terms" | "document";
  /** Manager-authored clauses merged into the Axis generated lease as an Additional Provisions addendum. */
  customLeaseTerms?: string;
  /** Uploaded lease template (PDF) — data URL while editing, storage URL once submitted. */
  leaseTemplateDocUrl?: string | null;
  /** Original filename of the uploaded lease template. */
  leaseTemplateDocName?: string;
};

const LEASE_TERM_OPTION_SET = new Set<string>(LEASE_TERM_OPTIONS);

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

export function formatLeaseTermsBodyFromAllowed(terms: string[]): string {
  const clean = terms.filter((t) => LEASE_TERM_OPTION_SET.has(t));
  if (clean.length === 0) return "";
  return `Available lease lengths: ${clean.join(", ")}.`;
}

export function resolveAllowedLeaseTerms(
  sub: Pick<ManagerListingSubmissionV1, "allowedLeaseTerms" | "leaseTermsBody"> | null | undefined,
): string[] {
  const fromArray = (sub?.allowedLeaseTerms ?? []).filter((t) => LEASE_TERM_OPTION_SET.has(t));
  if (fromArray.length > 0) return fromArray;
  const body = sub?.leaseTermsBody?.trim() ?? "";
  if (!body) return [];
  const found = LEASE_TERM_OPTIONS.filter((opt) => body.toLowerCase().includes(opt.toLowerCase()));
  return [...found];
}

export type ManagerListingServiceOption = {
  id: string;
  name: string;
  description: string;
  price: string;
  deposit: string;
  available: boolean;
  residentEmails?: string[];
  createdAt: string;
};

export type ManagerCustomApplicationFieldType = "text" | "number" | "select" | "checkbox" | "date";

export const CUSTOM_APPLICATION_FIELD_TYPE_OPTIONS: readonly {
  id: ManagerCustomApplicationFieldType;
  label: string;
}[] = [
  { id: "text", label: "Text" },
  { id: "number", label: "Number" },
  { id: "select", label: "Dropdown" },
  { id: "checkbox", label: "Checkbox" },
  { id: "date", label: "Date" },
];

/** Manager-defined application question asked during the rental application for this listing. */
export type ManagerCustomApplicationField = {
  id: string;
  /** Stable answer key (slug of the label at creation; unchanged by later label edits). */
  key: string;
  label: string;
  type: ManagerCustomApplicationFieldType;
  required: boolean;
  /** Choices for `select` fields; ignored for other types. Array order is display order. */
  options: string[];
  /** Application section this question belongs to (RentalApplicationSectionId). Absent = Additional details. */
  section?: string;
  /** When set, this row customizes a built-in Axis application question. */
  standardKey?: string;
};

const CUSTOM_APPLICATION_FIELD_TYPES = new Set<string>(
  CUSTOM_APPLICATION_FIELD_TYPE_OPTIONS.map((o) => o.id),
);

/** Kebab-case answer key from a question label, unique against `taken`. */
export function customApplicationFieldKeyFromLabel(label: string, taken: Iterable<string>): string {
  const base =
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "question";
  const used = new Set(taken);
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

/** Coerce persisted custom application fields into a clean array (drops malformed rows). */
export function normalizeCustomApplicationFields(
  raw: unknown,
  opts?: { includeIncomplete?: boolean },
): ManagerCustomApplicationField[] {
  const includeIncomplete = opts?.includeIncomplete === true;
  if (!Array.isArray(raw)) return [];
  const out: ManagerCustomApplicationField[] = [];
  const usedKeys = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const label = typeof o.label === "string" ? o.label.trim() : "";
    if (!label && !includeIncomplete) continue;
    const id = typeof o.id === "string" && o.id.trim() ? o.id.trim() : rid("caf");
    const type = CUSTOM_APPLICATION_FIELD_TYPES.has(String(o.type))
      ? (o.type as ManagerCustomApplicationFieldType)
      : "text";
    const key =
      typeof o.key === "string" && o.key.trim()
        ? o.key.trim()
        : label
          ? customApplicationFieldKeyFromLabel(label, usedKeys)
          : `draft-${id}`;
    if (usedKeys.has(key)) continue;
    usedKeys.add(key);
    const options =
      type === "select" && Array.isArray(o.options)
        ? (o.options as unknown[])
            .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
            .map((v) => v.trim())
        : [];
    const standardKey =
      typeof o.standardKey === "string" && o.standardKey.trim() ? o.standardKey.trim() : undefined;
    // Built-in overrides may be dynamic selects (property, rooms) with no fixed option list.
    if (type === "select" && options.length === 0 && !includeIncomplete && !standardKey) continue;
    const section =
      typeof o.section === "string" && RENTAL_APPLICATION_SECTION_IDS.has(o.section) ? o.section : undefined;
    out.push({
      id,
      key,
      label,
      type,
      required: o.required === true,
      options,
      section,
      standardKey,
    });
  }
  return out;
}

/** Editor UI — keep in-progress custom rows (empty label) until the manager saves. */
export function normalizeCustomApplicationFieldsForEditor(raw: unknown): ManagerCustomApplicationField[] {
  return normalizeCustomApplicationFields(raw, { includeIncomplete: true });
}

/**
 * True when the property should use the default Axis application only.
 * Legacy submissions (no mode saved) keep today's behavior: custom questions apply if present.
 */
export function listingUsesStandardApplication(
  sub:
    | {
        applicationConfigMode?: unknown;
        disabledStandardApplicationKeys?: unknown;
        customApplicationFields?: unknown;
      }
    | null
    | undefined,
): boolean {
  if (!sub || sub.applicationConfigMode === "custom") return false;
  const hasCustomization =
    (Array.isArray(sub.disabledStandardApplicationKeys) && sub.disabledStandardApplicationKeys.length > 0) ||
    (Array.isArray(sub.customApplicationFields) && sub.customApplicationFields.length > 0);
  if (sub.applicationConfigMode === "standard") return !hasCustomization;
  return !hasCustomization;
}

/** Custom lease clauses to merge into the generated lease; "" unless custom terms are active. */
export function activeCustomLeaseTerms(
  sub: { leaseConfigMode?: unknown; leaseCustomKind?: unknown; customLeaseTerms?: unknown } | null | undefined,
): string {
  if (!sub || sub.leaseConfigMode !== "custom") return "";
  if (sub.leaseCustomKind === "document") return "";
  return typeof sub.customLeaseTerms === "string" ? sub.customLeaseTerms.trim() : "";
}

/** Uploaded lease template to use instead of the Axis generated lease, or null. */
export function activeLeaseTemplateDoc(
  sub:
    | { leaseConfigMode?: unknown; leaseCustomKind?: unknown; leaseTemplateDocUrl?: unknown; leaseTemplateDocName?: unknown }
    | null
    | undefined,
): { url: string; name: string } | null {
  if (!sub || sub.leaseConfigMode !== "custom" || sub.leaseCustomKind !== "document") return null;
  const url = typeof sub.leaseTemplateDocUrl === "string" ? sub.leaseTemplateDocUrl.trim() : "";
  if (!url) return null;
  const name = typeof sub.leaseTemplateDocName === "string" && sub.leaseTemplateDocName.trim()
    ? sub.leaseTemplateDocName.trim()
    : "Lease template.pdf";
  return { url, name };
}

/** Legacy persisted shapes (optional fields). */
type LegacyListingSubmissionFields = {
  paymentAtSigning?: string;
  utilitiesMonthly?: string;
  sharedSpacesDescription?: string;
};

/** Match legacy free-text room lists ("Room 1, Room 2") to current room ids by name. */
export function matchRoomIdsFromLegacyNames(text: string, rooms: ManagerRoomSubmission[]): string[] {
  if (!text.trim()) return [];
  const parts = text.split(/[,;&]/).map((s) => s.trim()).filter(Boolean);
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    const hit =
      rooms.find((x) => x.name.trim().toLowerCase() === part.toLowerCase()) ??
      rooms.find((x) => x.name.trim().toLowerCase().includes(part.toLowerCase()));
    if (hit && !seen.has(hit.id)) {
      seen.add(hit.id);
      ids.push(hit.id);
    }
  }
  return ids;
}

let idCounter = 0;
function rid(prefix: string) {
  idCounter += 1;
  return `${prefix}-${Date.now()}-${idCounter}`;
}

/** True when the listing is rented as one lease for the full unit. */
export function isEntireHomeListing(sub: Pick<ManagerListingSubmissionV1, "listingPlaceCategoryId">): boolean {
  return sub.listingPlaceCategoryId === "entire_home";
}

/** Resolved monthly rent for an entire-home listing. */
export function entireHomeMonthlyRentAmount(sub: Pick<ManagerListingSubmissionV1, "entireHomeMonthlyRent" | "rooms">): number {
  if (typeof sub.entireHomeMonthlyRent === "number" && sub.entireHomeMonthlyRent > 0) {
    return Math.round(sub.entireHomeMonthlyRent);
  }
  return sub.rooms.reduce((max, room) => Math.max(max, room.monthlyRent > 0 ? room.monthlyRent : 0), 0);
}

export type EntireHomePricingPatch = Partial<
  Pick<
    ManagerListingSubmissionV1,
    | "entireHomeMonthlyRent"
    | "entireHomeUtilitiesEstimate"
    | "entireHomeUtilitiesPaymentModel"
    | "entireHomeProrateMethod"
    | "entireHomeDailyRentRate"
    | "entireHomeDailyUtilitiesRate"
  >
>;

/** Store entire-home lease pricing on the first named room; clear per-room amounts elsewhere. */
export function syncEntireHomeRoomPricing(
  rooms: ManagerRoomSubmission[],
  pricing: {
    rent: number;
    utilitiesEstimate?: string;
    utilitiesPaymentModel?: UtilitiesPaymentModel;
    prorateMethod?: "auto" | "daily_rate";
    dailyRentRate?: number;
    dailyUtilitiesRate?: number;
  },
): ManagerRoomSubmission[] {
  const amount = Math.max(0, Math.round(pricing.rent));
  const utils = pricing.utilitiesEstimate ?? "";
  const utilModel = normalizeUtilitiesPaymentModel(pricing.utilitiesPaymentModel);
  const prorate = pricing.prorateMethod === "daily_rate" ? "daily_rate" : "auto";
  let assigned = false;
  return rooms.map((room) => {
    if (!assigned && room.name.trim()) {
      assigned = true;
      return {
        ...room,
        monthlyRent: amount,
        utilitiesEstimate: utils,
        utilitiesPaymentModel: utilModel,
        prorateMethod: prorate,
        dailyRentRate: prorate === "daily_rate" ? pricing.dailyRentRate : undefined,
        dailyUtilitiesRate: prorate === "daily_rate" ? pricing.dailyUtilitiesRate : undefined,
      };
    }
    return {
      ...room,
      monthlyRent: 0,
      utilitiesEstimate: "",
      prorateMethod: "auto" as const,
      dailyRentRate: undefined,
      dailyUtilitiesRate: undefined,
    };
  });
}

/** @deprecated Use syncEntireHomeRoomPricing */
export function syncEntireHomeRoomRents(rooms: ManagerRoomSubmission[], rent: number): ManagerRoomSubmission[] {
  return syncEntireHomeRoomPricing(rooms, { rent });
}

function primaryEntireHomeRoom(rooms: ManagerRoomSubmission[]): ManagerRoomSubmission | undefined {
  return rooms.find((r) => r.name.trim());
}

/** Apply entire-home rent + utilities + proration (fields + first-room sync). */
export function applyEntireHomeListingPricing(
  sub: ManagerListingSubmissionV1,
  patch: EntireHomePricingPatch = {},
): ManagerListingSubmissionV1 {
  const primary = primaryEntireHomeRoom(sub.rooms);
  const merged: ManagerListingSubmissionV1 = {
    ...sub,
    ...patch,
    listingPlaceCategoryId: "entire_home",
    entireHomeMonthlyRent:
      patch.entireHomeMonthlyRent !== undefined
        ? Math.max(0, Math.round(Number(patch.entireHomeMonthlyRent) || 0))
        : sub.entireHomeMonthlyRent,
    entireHomeUtilitiesEstimate:
      patch.entireHomeUtilitiesEstimate !== undefined
        ? patch.entireHomeUtilitiesEstimate
        : (sub.entireHomeUtilitiesEstimate ?? primary?.utilitiesEstimate ?? ""),
    entireHomeUtilitiesPaymentModel:
      patch.entireHomeUtilitiesPaymentModel !== undefined
        ? patch.entireHomeUtilitiesPaymentModel
        : (sub.entireHomeUtilitiesPaymentModel ?? primary?.utilitiesPaymentModel),
    entireHomeProrateMethod:
      patch.entireHomeProrateMethod !== undefined
        ? patch.entireHomeProrateMethod
        : (sub.entireHomeProrateMethod ?? primary?.prorateMethod ?? "auto"),
    entireHomeDailyRentRate:
      patch.entireHomeDailyRentRate !== undefined ? patch.entireHomeDailyRentRate : sub.entireHomeDailyRentRate,
    entireHomeDailyUtilitiesRate:
      patch.entireHomeDailyUtilitiesRate !== undefined
        ? patch.entireHomeDailyUtilitiesRate
        : sub.entireHomeDailyUtilitiesRate,
  };
  const rent =
    patch.entireHomeMonthlyRent !== undefined
      ? Math.max(0, Math.round(Number(patch.entireHomeMonthlyRent) || 0))
      : entireHomeMonthlyRentAmount(merged);
  return {
    ...merged,
    entireHomeMonthlyRent: rent,
    rooms: syncEntireHomeRoomPricing(merged.rooms, {
      rent,
      utilitiesEstimate: merged.entireHomeUtilitiesEstimate ?? "",
      utilitiesPaymentModel: merged.entireHomeUtilitiesPaymentModel,
      prorateMethod: merged.entireHomeProrateMethod ?? "auto",
      dailyRentRate: merged.entireHomeDailyRentRate,
      dailyUtilitiesRate: merged.entireHomeDailyUtilitiesRate,
    }),
  };
}

/** Apply entire-home rent to submission state (field + room sync). */
export function applyEntireHomeMonthlyRent(
  sub: ManagerListingSubmissionV1,
  rent: number,
): ManagerListingSubmissionV1 {
  return applyEntireHomeListingPricing(sub, { entireHomeMonthlyRent: Math.max(0, Math.round(Number(rent) || 0)) });
}

/** Coerces older saved submissions into the current v1 shape (preserves listing data where possible). */
export function normalizeManagerListingSubmissionV1(sub: ManagerListingSubmissionV1): ManagerListingSubmissionV1 {
  const legacy = sub as ManagerListingSubmissionV1 & LegacyListingSubmissionFields;
  const fallbackUtil = legacy.utilitiesMonthly?.trim() ?? "";

  let paymentAtSigningIncludes = sub.paymentAtSigningIncludes;
  if (!Array.isArray(paymentAtSigningIncludes) || paymentAtSigningIncludes.length === 0) {
    paymentAtSigningIncludes = legacy.paymentAtSigning?.trim()
      ? (["security_deposit", "move_in_fee"] as PaymentAtSigningOptionId[])
      : (["security_deposit", "move_in_fee"] as PaymentAtSigningOptionId[]);
  } else {
    const allowed = new Set(PAYMENT_AT_SIGNING_OPTIONS.map((o) => o.id));
    paymentAtSigningIncludes = paymentAtSigningIncludes.filter((id): id is PaymentAtSigningOptionId => allowed.has(id));
    if (paymentAtSigningIncludes.length === 0) {
      paymentAtSigningIncludes = ["security_deposit", "move_in_fee"];
    }
  }

  const rooms: ManagerRoomSubmission[] = sub.rooms.map((r) => {
    const legacyRoom = r as ManagerRoomSubmission & { bathroomSetup?: string; sharesBathWith?: string };
    return {
      id: legacyRoom.id,
      name: legacyRoom.name ?? "",
      floor: legacyRoom.floor ?? "",
      monthlyRent: legacyRoom.monthlyRent ?? 0,
      availability: legacyRoom.availability ?? "",
      detail: legacyRoom.detail ?? "",
      photoDataUrls: legacyRoom.photoDataUrls ?? [],
      videoDataUrl: legacyRoom.videoDataUrl ?? null,
      utilitiesEstimate:
        typeof legacyRoom.utilitiesEstimate === "string" && legacyRoom.utilitiesEstimate.length > 0
          ? legacyRoom.utilitiesEstimate
          : fallbackUtil,
      utilitiesPaymentModel: normalizeUtilitiesPaymentModel(
        (legacyRoom as ManagerRoomSubmission).utilitiesPaymentModel,
      ),
      furnishing: (() => {
        const f = typeof legacyRoom.furnishing === "string" ? legacyRoom.furnishing : "";
        return f.trim().length === 0 ? "" : f;
      })(),
      roomAmenitiesText:
        typeof (legacyRoom as ManagerRoomSubmission & { roomAmenitiesText?: unknown }).roomAmenitiesText === "string"
          ? (legacyRoom as ManagerRoomSubmission & { roomAmenitiesText: string }).roomAmenitiesText
          : "",
      moveInAvailableDate:
        typeof (legacyRoom as ManagerRoomSubmission & { moveInAvailableDate?: unknown }).moveInAvailableDate === "string"
          ? (legacyRoom as ManagerRoomSubmission & { moveInAvailableDate: string }).moveInAvailableDate.trim()
          : "",
      moveInInstructions:
        typeof (legacyRoom as ManagerRoomSubmission & { moveInInstructions?: unknown }).moveInInstructions === "string"
          ? (legacyRoom as ManagerRoomSubmission & { moveInInstructions: string }).moveInInstructions.trim()
          : "",
      prorateMethod: (legacyRoom.prorateMethod === "daily_rate" ? "daily_rate" : "auto") as "auto" | "daily_rate",
      dailyRentRate: (() => {
        const v = legacyRoom.dailyRentRate;
        const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
        return Number.isFinite(n) && n > 0 ? n : undefined;
      })(),
      dailyUtilitiesRate: (() => {
        const v = legacyRoom.dailyUtilitiesRate;
        const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
        return Number.isFinite(n) && n > 0 ? n : undefined;
      })(),
      dailyRentPrice: (() => {
        const v = (legacyRoom as ManagerRoomSubmission).dailyRentPrice;
        const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
        return Number.isFinite(n) && n > 0 ? n : undefined;
      })(),
      // Only honor an explicit "daily" basis backed by a positive daily price; anything
      // else (including absent) normalizes to monthly so existing rooms are untouched.
      rentBasis: (() => {
        const v = (legacyRoom as ManagerRoomSubmission).rentBasis;
        const price = (legacyRoom as ManagerRoomSubmission).dailyRentPrice;
        const priceN = typeof price === "number" ? price : typeof price === "string" ? parseFloat(price) : NaN;
        return v === "daily" && Number.isFinite(priceN) && priceN > 0 ? "daily" : "monthly";
      })(),
      manualUnavailableRanges: (() => {
        const raw = (legacyRoom as ManagerRoomSubmission & { manualUnavailableRanges?: unknown }).manualUnavailableRanges;
        if (!Array.isArray(raw)) return [];
        const out: ManagerRoomUnavailableRange[] = [];
        for (const item of raw) {
          if (!item || typeof item !== "object") continue;
          const o = item as Record<string, unknown>;
          const id =
            typeof o.id === "string" && o.id.trim()
              ? o.id.trim()
              : `unavail-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
          const start = typeof o.start === "string" ? o.start.trim() : "";
          const end = typeof o.end === "string" ? o.end.trim() : "";
          if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) continue;
          out.push({ id, start, end });
        }
        return out;
      })(),
    };
  });

  let bundles = sub.bundles;
  if (!Array.isArray(bundles)) bundles = [];
  bundles = bundles.map((b) => ({
    id: b.id ?? rid("bundle"),
    label: b.label ?? "",
    price: b.price ?? "",
    strikethrough: b.strikethrough ?? "",
    promo: b.promo ?? "",
    roomsLine: b.roomsLine ?? "",
    includedRoomIds: Array.isArray(b.includedRoomIds)
      ? rooms.map((room) => room.id).filter((id) => b.includedRoomIds?.includes(id))
      : [],
  }));

  let quickFacts = sub.quickFacts;
  if (!Array.isArray(quickFacts)) quickFacts = [];
  quickFacts = quickFacts.map((q) => ({
    id: q.id ?? rid("qf"),
    label: q.label ?? "",
    value: q.value ?? "",
  }));

  let customFees = sub.customFees;
  if (!Array.isArray(customFees)) customFees = [];
  customFees = customFees.map((f) => ({
    id: f.id ?? rid("fee"),
    label: typeof f.label === "string" ? f.label.trim() : "",
    amount: typeof f.amount === "string" ? f.amount.trim() : "",
    frequency: f.frequency === "one-time" ? "one-time" : "monthly",
  }));

  const serviceRequestOptions = Array.isArray((sub as { serviceRequestOptions?: unknown }).serviceRequestOptions)
    ? ((sub as { serviceRequestOptions?: unknown }).serviceRequestOptions as unknown[])
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
        .map((item) => {
          const idRaw = typeof item.id === "string" ? item.id.trim() : "";
          const residentEmailsRaw = Array.isArray(item.residentEmails)
            ? (item.residentEmails as unknown[])
                .filter((value): value is string => typeof value === "string" && value.trim().includes("@"))
                .map((value) => value.trim().toLowerCase())
            : [];
          return {
            id: idRaw || `offer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name: typeof item.name === "string" ? item.name.trim() : "",
            description: typeof item.description === "string" ? item.description.trim() : "",
            price: typeof item.price === "string" ? item.price.trim() : "",
            deposit: typeof item.deposit === "string" ? item.deposit.trim() : "",
            available: item.available !== false,
            residentEmails: residentEmailsRaw.length > 0 ? residentEmailsRaw : undefined,
            createdAt:
              typeof item.createdAt === "string" && item.createdAt.trim()
                ? item.createdAt
                : new Date().toISOString(),
          } satisfies ManagerListingServiceOption;
        })
    : [];

  const bathrooms = sub.bathrooms.map((b) => {
    const legacyBath = b as ManagerBathroomSubmission & { sharedByRooms?: string };
    let assignedRoomIds = legacyBath.assignedRoomIds;
    if (!Array.isArray(assignedRoomIds)) assignedRoomIds = [];
    if (assignedRoomIds.length === 0 && legacyBath.sharedByRooms?.trim()) {
      assignedRoomIds = matchRoomIdsFromLegacyNames(legacyBath.sharedByRooms, rooms);
    }
    const allResidents = Boolean((legacyBath as ManagerBathroomSubmission).allResidents);
    const rawAccess = (legacyBath as ManagerBathroomSubmission).accessKindByRoomId;
    let accessKindByRoomId: ManagerBathroomSubmission["accessKindByRoomId"] = undefined;
    if (!allResidents && rawAccess && typeof rawAccess === "object") {
      const next: Partial<Record<string, ManagerBathroomRoomAccessKind>> = {};
      for (const [k, v] of Object.entries(rawAccess)) {
        if (v === "ensuite" || v === "shared" || v === "hall") next[k] = v;
      }
      accessKindByRoomId = Object.keys(next).length ? next : undefined;
    }

    return {
      id: legacyBath.id,
      name: legacyBath.name ?? "",
      location: legacyBath.location ?? "",
      amenitiesText:
        typeof (legacyBath as ManagerBathroomSubmission & { amenitiesText?: string }).amenitiesText === "string"
          ? (legacyBath as ManagerBathroomSubmission & { amenitiesText: string }).amenitiesText
          : "",
      photoDataUrls:
        Array.isArray((legacyBath as ManagerBathroomSubmission & { photoDataUrls?: unknown }).photoDataUrls)
          ? ((legacyBath as ManagerBathroomSubmission & { photoDataUrls?: unknown }).photoDataUrls as unknown[])
              .filter((u): u is string => typeof u === "string" && u.trim().length > 0)
              .slice(0, 8)
          : [],
      videoDataUrl:
        typeof (legacyBath as ManagerBathroomSubmission & { videoDataUrl?: unknown }).videoDataUrl === "string"
          ? ((legacyBath as ManagerBathroomSubmission & { videoDataUrl?: string }).videoDataUrl || null)
          : null,
      shower: legacyBath.shower ?? true,
      toilet: legacyBath.toilet ?? true,
      bathtub: legacyBath.bathtub ?? false,
      assignedRoomIds: allResidents ? [] : assignedRoomIds,
      allResidents,
      accessKindByRoomId: allResidents ? undefined : accessKindByRoomId,
    };
  });

  let sharedSpaces = sub.sharedSpaces;
  if (!Array.isArray(sharedSpaces)) sharedSpaces = [];
  const legacySharedText = (legacy as LegacyListingSubmissionFields).sharedSpacesDescription?.trim();
  if (sharedSpaces.length === 0 && legacySharedText) {
    sharedSpaces = [
      {
        id: rid("sspace"),
        name: "Shared areas",
        location: "",
        detail: legacySharedText,
        amenitiesText: "",
        photoDataUrls: [],
        videoDataUrl: null,
        roomAccessIds: rooms.map((r) => r.id),
      },
    ];
  } else {
    sharedSpaces = sharedSpaces.map((ss) => ({
      ...(function normalizeSharedSpaceRow() {
        const rawLocation =
          typeof (ss as ManagerSharedSpaceSubmission & { location?: unknown }).location === "string"
            ? ((ss as ManagerSharedSpaceSubmission & { location: string }).location ?? "")
            : "";
        const rawDetail = typeof ss.detail === "string" ? ss.detail : "";
        const lines = rawDetail.split(/\r?\n/);
        const locationFromDetail = lines
          .find((line) => /^\s*Location:\s*/i.test(line))
          ?.replace(/^\s*Location:\s*/i, "")
          .trim() ?? "";
        const detailWithoutLocation = lines.filter((line) => !/^\s*Location:\s*/i.test(line)).join("\n").trim();
        const boilerplate = new Set([
          "Shared kitchen and dining area. Add appliances, storage, cleanup expectations, and how residents share the space.",
          "Shared lounge or living area. Add seating, TV, quiet hours, guest expectations, and any usage rules.",
          "Laundry area access, machines, scheduling expectations, and whether supplies are included.",
          "Shared outdoor space, patio, deck, or yard. Add access, storage, guest rules, and maintenance expectations.",
        ]);
        return {
          normalizedLocation: rawLocation.trim() || locationFromDetail,
          normalizedDetail: boilerplate.has(detailWithoutLocation) ? "" : detailWithoutLocation,
        };
      })(),
      id: ss.id,
      name: ss.name ?? "",
      location: (function () {
        const rawLocation =
          typeof (ss as ManagerSharedSpaceSubmission & { location?: unknown }).location === "string"
            ? ((ss as ManagerSharedSpaceSubmission & { location: string }).location ?? "")
            : "";
        const rawDetail = typeof ss.detail === "string" ? ss.detail : "";
        const lines = rawDetail.split(/\r?\n/);
        const locationFromDetail = lines
          .find((line) => /^\s*Location:\s*/i.test(line))
          ?.replace(/^\s*Location:\s*/i, "")
          .trim() ?? "";
        return rawLocation.trim() || locationFromDetail;
      })(),
      detail: (function () {
        const rawDetail = typeof ss.detail === "string" ? ss.detail : "";
        const lines = rawDetail.split(/\r?\n/);
        const cleaned = lines.filter((line) => !/^\s*Location:\s*/i.test(line)).join("\n").trim();
        const boilerplate = new Set([
          "Shared kitchen and dining area. Add appliances, storage, cleanup expectations, and how residents share the space.",
          "Shared lounge or living area. Add seating, TV, quiet hours, guest expectations, and any usage rules.",
          "Laundry area access, machines, scheduling expectations, and whether supplies are included.",
          "Shared outdoor space, patio, deck, or yard. Add access, storage, guest rules, and maintenance expectations.",
        ]);
        return boilerplate.has(cleaned) ? "" : cleaned;
      })(),
      amenitiesText:
        typeof (ss as ManagerSharedSpaceSubmission & { amenitiesText?: string }).amenitiesText === "string"
          ? (ss as ManagerSharedSpaceSubmission & { amenitiesText: string }).amenitiesText
          : "",
      photoDataUrls:
        Array.isArray((ss as ManagerSharedSpaceSubmission & { photoDataUrls?: unknown }).photoDataUrls)
          ? ((ss as ManagerSharedSpaceSubmission & { photoDataUrls?: unknown }).photoDataUrls as unknown[])
              .filter((u): u is string => typeof u === "string" && u.trim().length > 0)
              .slice(0, 8)
          : [],
      videoDataUrl:
        typeof (ss as ManagerSharedSpaceSubmission & { videoDataUrl?: unknown }).videoDataUrl === "string"
          ? ((ss as ManagerSharedSpaceSubmission & { videoDataUrl?: string }).videoDataUrl || null)
          : null,
      roomAccessIds: Array.isArray(ss.roomAccessIds) ? [...ss.roomAccessIds] : [],
      spaceKind: normalizeSharedSpaceKind(
        (ss as ManagerSharedSpaceSubmission & { spaceKind?: unknown }).spaceKind,
        typeof ss.name === "string" ? ss.name : "",
      ),
    }));
  }

  const zelleEnabled = Boolean(sub.zellePaymentsEnabled && sub.zelleContact?.trim());
  const venmoEnabled = Boolean(sub.venmoPaymentsEnabled && sub.venmoContact?.trim());
  const otherChannelActive = Boolean(
    sub.applicationFeeOtherEnabled &&
      typeof sub.applicationFeeOtherInstructions === "string" &&
      sub.applicationFeeOtherInstructions.trim(),
  );
  const applicationFeeStripeEnabled = sub.axisPaymentsEnabled !== false;
  const applicationFeeZelleEnabled = zelleEnabled;
  const applicationFeeVenmoEnabled = venmoEnabled;
  const applicationFeeOtherEnabled = otherChannelActive;

  const allowedLeaseTerms = resolveAllowedLeaseTerms(sub);
  const leaseTermsBody =
    allowedLeaseTerms.length > 0
      ? formatLeaseTermsBodyFromAllowed(allowedLeaseTerms)
      : typeof sub.leaseTermsBody === "string"
        ? sub.leaseTermsBody
        : "";

  const housePhotoDataUrls = Array.isArray(sub.housePhotoDataUrls)
    ? sub.housePhotoDataUrls.filter((u): u is string => typeof u === "string" && u.trim().length > 0).slice(0, 12)
    : [];

  const listingBedroomSlots =
    typeof sub.listingBedroomSlots === "number" && sub.listingBedroomSlots >= 1
      ? Math.min(20, Math.round(sub.listingBedroomSlots))
      : rooms.length;

  const listingPlaceCategoryId =
    typeof sub.listingPlaceCategoryId === "string" && sub.listingPlaceCategoryId.trim()
      ? sub.listingPlaceCategoryId.trim()
      : "shared_home";

  let entireHomeMonthlyRent =
    typeof sub.entireHomeMonthlyRent === "number" && sub.entireHomeMonthlyRent > 0
      ? Math.round(sub.entireHomeMonthlyRent)
      : 0;

  const primaryRoom = rooms.find((r) => r.name.trim());
  const entireHomeUtilitiesEstimate =
    typeof sub.entireHomeUtilitiesEstimate === "string" ? sub.entireHomeUtilitiesEstimate : (primaryRoom?.utilitiesEstimate ?? "");
  const entireHomeUtilitiesPaymentModel = normalizeUtilitiesPaymentModel(
    sub.entireHomeUtilitiesPaymentModel ?? primaryRoom?.utilitiesPaymentModel,
  );
  const entireHomeProrateMethod: "auto" | "daily_rate" =
    sub.entireHomeProrateMethod === "daily_rate" ? "daily_rate" : (primaryRoom?.prorateMethod === "daily_rate" ? "daily_rate" : "auto");
  const entireHomeDailyRentRate = sub.entireHomeDailyRentRate ?? primaryRoom?.dailyRentRate;
  const entireHomeDailyUtilitiesRate = sub.entireHomeDailyUtilitiesRate ?? primaryRoom?.dailyUtilitiesRate;

  let normalizedRooms = rooms;
  if (isEntireHomeListing({ listingPlaceCategoryId })) {
    if (entireHomeMonthlyRent <= 0) {
      entireHomeMonthlyRent = rooms.reduce((max, r) => Math.max(max, r.monthlyRent > 0 ? r.monthlyRent : 0), 0);
    }
    normalizedRooms = syncEntireHomeRoomPricing(rooms, {
      rent: entireHomeMonthlyRent,
      utilitiesEstimate: entireHomeUtilitiesEstimate,
      utilitiesPaymentModel: entireHomeUtilitiesPaymentModel,
      prorateMethod: entireHomeProrateMethod,
      dailyRentRate: entireHomeDailyRentRate,
      dailyUtilitiesRate: entireHomeDailyUtilitiesRate,
    });
  }

  const next = {
    ...sub,
    listingPropertyTypeId: typeof sub.listingPropertyTypeId === "string" ? sub.listingPropertyTypeId : "",
    listingPlaceCategoryId,
    entireHomeMonthlyRent: isEntireHomeListing({ listingPlaceCategoryId }) ? entireHomeMonthlyRent : undefined,
    entireHomeUtilitiesEstimate: isEntireHomeListing({ listingPlaceCategoryId }) ? entireHomeUtilitiesEstimate : undefined,
    entireHomeUtilitiesPaymentModel: isEntireHomeListing({ listingPlaceCategoryId }) ? entireHomeUtilitiesPaymentModel : undefined,
    entireHomeProrateMethod: isEntireHomeListing({ listingPlaceCategoryId }) ? entireHomeProrateMethod : undefined,
    entireHomeDailyRentRate: isEntireHomeListing({ listingPlaceCategoryId }) ? entireHomeDailyRentRate : undefined,
    entireHomeDailyUtilitiesRate: isEntireHomeListing({ listingPlaceCategoryId }) ? entireHomeDailyUtilitiesRate : undefined,
    listingStoriesId: typeof sub.listingStoriesId === "string" ? sub.listingStoriesId : "",
    listingTotalBathroomsId: typeof sub.listingTotalBathroomsId === "string" ? sub.listingTotalBathroomsId : "",
    listingBedroomSlots,
    homeStructureNote: typeof sub.homeStructureNote === "string" ? sub.homeStructureNote : "",
    houseRulesText: typeof sub.houseRulesText === "string" ? sub.houseRulesText : "",
    houseDescription: typeof sub.houseDescription === "string" ? sub.houseDescription : undefined,
    generalHouseInfo: typeof sub.generalHouseInfo === "string" ? sub.generalHouseInfo : "",
    wifiNetworkName: typeof sub.wifiNetworkName === "string" ? sub.wifiNetworkName : "",
    wifiPassword: typeof sub.wifiPassword === "string" ? sub.wifiPassword : "",
    houseMoveInAvailableDate:
      typeof sub.houseMoveInAvailableDate === "string" ? sub.houseMoveInAvailableDate.trim() : "",
    houseMoveInInstructions:
      typeof sub.houseMoveInInstructions === "string" ? sub.houseMoveInInstructions.trim() : "",
    shortTermRentalsAllowed: Boolean(sub.shortTermRentalsAllowed),
    shortTermRequirements: typeof sub.shortTermRequirements === "string" ? sub.shortTermRequirements : "",
    shortTermDailyCost: typeof sub.shortTermDailyCost === "string" ? sub.shortTermDailyCost : "",
    shortTermDeposit: typeof sub.shortTermDeposit === "string" ? sub.shortTermDeposit : "",
    shortTermMoveInFee: typeof sub.shortTermMoveInFee === "string" ? sub.shortTermMoveInFee : "",
    monthToMonthSurcharge: typeof sub.monthToMonthSurcharge === "string" ? sub.monthToMonthSurcharge : "",
    allowedLeaseTerms,
    leaseTermsBody,
    paymentAtSigningIncludes,
    rooms: normalizedRooms,
    bathrooms,
    sharedSpaces,
    bundles,
    quickFacts,
    customFees,
    serviceRequestOptions,
    customApplicationFields: normalizeCustomApplicationFields(
      (sub as { customApplicationFields?: unknown }).customApplicationFields,
    ),
    disabledStandardApplicationKeys: Array.isArray(sub.disabledStandardApplicationKeys)
      ? sub.disabledStandardApplicationKeys.filter((k): k is string => typeof k === "string" && k.trim().length > 0)
      : [],
    applicationConfigMode:
      sub.applicationConfigMode === "standard" || sub.applicationConfigMode === "custom"
        ? sub.applicationConfigMode
        : undefined,
    leaseConfigMode:
      sub.leaseConfigMode === "standard" || sub.leaseConfigMode === "custom" ? sub.leaseConfigMode : undefined,
    leaseCustomKind: sub.leaseCustomKind === "document" ? "document" : sub.leaseCustomKind === "terms" ? "terms" : undefined,
    customLeaseTerms: typeof sub.customLeaseTerms === "string" ? sub.customLeaseTerms : "",
    leaseTemplateDocUrl: typeof sub.leaseTemplateDocUrl === "string" ? sub.leaseTemplateDocUrl || null : null,
    leaseTemplateDocName: typeof sub.leaseTemplateDocName === "string" ? sub.leaseTemplateDocName : "",
    applicationFeeStripeEnabled,
    applicationFeeZelleEnabled,
    applicationFeeVenmoEnabled,
    applicationFeeOtherEnabled,
    applicationFeeOtherInstructions:
      typeof sub.applicationFeeOtherInstructions === "string" ? sub.applicationFeeOtherInstructions : "",
    allowMultiplePropertyApplications: sub.allowMultiplePropertyApplications === true,
    applicationFeeOnlyFirstApplication: sub.applicationFeeOnlyFirstApplication === true,
    rentDueDayMode: sub.rentDueDayMode === "last_of_month" ? "last_of_month" : "first_of_month",
    lateFeeEnabled: sub.lateFeeEnabled !== false,
    lateFeeGraceDays: (() => {
      const n = Number(sub.lateFeeGraceDays ?? 5);
      return Number.isFinite(n) ? Math.max(0, Math.min(30, Math.round(n))) : 5;
    })(),
    lateFeeAmount: typeof sub.lateFeeAmount === "string" ? sub.lateFeeAmount : "50",
    axisPaymentsEnabled: sub.axisPaymentsEnabled !== false,
    acceptedPaymentMethods: Array.isArray(sub.acceptedPaymentMethods)
      ? sub.acceptedPaymentMethods.filter(
          (m): m is "zelle" | "venmo" | "ach" | "card" =>
            m === "zelle" || m === "venmo" || m === "ach" || m === "card",
        )
      : undefined,
    housePhotoDataUrls,
    houseVideoDataUrl: typeof (sub as Record<string, unknown>).houseVideoDataUrl === "string"
      ? ((sub as Record<string, unknown>).houseVideoDataUrl as string) || null
      : null,
    floorPlanByLabel: (() => {
      const raw = (sub as { floorPlanByLabel?: unknown }).floorPlanByLabel;
      if (!raw || typeof raw !== "object") return undefined;
      const out: Record<string, string> = {};
      for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
        if (typeof key !== "string" || !key.trim()) continue;
        if (typeof value !== "string" || !value.trim()) continue;
        out[key.trim()] = value.trim();
      }
      return Object.keys(out).length > 0 ? out : undefined;
    })(),
    propertyFloorPlanDataUrl:
      typeof sub.propertyFloorPlanDataUrl === "string" && sub.propertyFloorPlanDataUrl.trim()
        ? sub.propertyFloorPlanDataUrl.trim()
        : null,
  };
  delete (next as Record<string, unknown>).sharedSpacesDescription;
  delete (next as Record<string, unknown>).paymentAtSigning;
  delete (next as Record<string, unknown>).utilitiesMonthly;
  return next as ManagerListingSubmissionV1;
}

export function emptyRoom(index: number): ManagerRoomSubmission {
  return {
    id: rid("room"),
    name: `Room ${index + 1}`,
    floor: "",
    monthlyRent: 0,
    availability: "Available now",
    moveInAvailableDate: "",
    moveInInstructions: "",
    manualUnavailableRanges: [],
    detail: "",
    furnishing: "",
    roomAmenitiesText: "",
    photoDataUrls: [],
    videoDataUrl: null,
    utilitiesEstimate: "",
    utilitiesPaymentModel: "manager_billed",
  };
}

export function emptyBundleRow(): ManagerBundleRow {
  return {
    id: rid("bundle"),
    label: "",
    price: "",
    strikethrough: "",
    promo: "",
    roomsLine: "",
    includedRoomIds: [],
  };
}

export function emptyQuickFactRow(): ManagerQuickFactRow {
  return {
    id: rid("qf"),
    label: "",
    value: "",
  };
}

export function emptyCustomFeeRow(): ManagerCustomFeeRow {
  return {
    id: rid("fee"),
    label: "",
    amount: "",
    frequency: "monthly",
  };
}

export function emptyCustomApplicationField(section?: string): ManagerCustomApplicationField {
  return {
    id: rid("caf"),
    key: "",
    label: "",
    type: "text",
    required: false,
    options: [],
    section,
  };
}

/** Copy a room for the add-listing form (new id so file inputs / keys stay unique). */
export function duplicateRoomEntry(source: ManagerRoomSubmission): ManagerRoomSubmission {
  return {
    ...source,
    id: rid("room"),
    name: source.name.trim() ? `${source.name.trim()} (copy)` : "Room (copy)",
    photoDataUrls: [...source.photoDataUrls],
    videoDataUrl: source.videoDataUrl,
    utilitiesEstimate: source.utilitiesEstimate ?? "",
    furnishing: source.furnishing ?? "",
    roomAmenitiesText: source.roomAmenitiesText ?? "",
    manualUnavailableRanges: (source.manualUnavailableRanges ?? []).map((r) => ({
      id: rid("unavail"),
      start: r.start,
      end: r.end,
    })),
  };
}

export function emptyBathroom(index: number): ManagerBathroomSubmission {
  return {
    id: rid("bath"),
    name: index === 0 ? "Full bath (hall)" : `Bathroom ${index + 1}`,
    location: "",
    amenitiesText: "",
    photoDataUrls: [],
    videoDataUrl: null,
    shower: true,
    toilet: true,
    bathtub: index === 0,
    assignedRoomIds: [],
    allResidents: false,
    accessKindByRoomId: undefined,
  };
}

export function emptySharedSpace(index: number): ManagerSharedSpaceSubmission {
  const name = index === 0 ? "Kitchen & dining" : `Shared space ${index + 1}`;
  return {
    id: rid("sspace"),
    name,
    spaceKind: index === 0 ? "kitchen" : inferSharedSpaceKind(name) ?? "other",
    location: "",
    detail: "",
    amenitiesText: "",
    photoDataUrls: [],
    videoDataUrl: null,
    roomAccessIds: [],
  };
}

/** One-line summary from structured listing basics (public quick facts). */
export function formatListingBasicsSummary(sub: ManagerListingSubmissionV1): string {
  const chunks: string[] = [];
  const pt = LISTING_PROPERTY_TYPE_OPTIONS.find((o) => o.id === sub.listingPropertyTypeId)?.label;
  if (pt) chunks.push(pt);
  const pc = LISTING_PLACE_CATEGORY_OPTIONS.find((o) => o.id === sub.listingPlaceCategoryId)?.short;
  if (pc) chunks.push(pc);
  const st = LISTING_STORIES_OPTIONS.find((o) => o.id === sub.listingStoriesId)?.label;
  if (st) chunks.push(st);
  const tb = LISTING_TOTAL_BATH_OPTIONS.find((o) => o.id === sub.listingTotalBathroomsId)?.label;
  if (tb) chunks.push(tb);
  const n = sub.listingBedroomSlots ?? sub.rooms.length;
  if (n > 0) {
    chunks.push(
      isEntireHomeListing(sub)
        ? `${n} bedroom${n === 1 ? "" : "s"}`
        : `${n} bedroom${n === 1 ? "" : "s"} for rent`,
    );
  }
  return chunks.join(" · ");
}

export function isRoomSlotRemovable(room: ManagerRoomSubmission): boolean {
  const name = room.name.trim();
  const defaultName = /^Room \d+$/.test(name);
  const avail = (room.availability ?? "").trim();
  const defaultAvail = avail === "" || avail === "Available now";
  const util = (room.utilitiesEstimate ?? "").replace(/^\$/, "").trim();
  return (
    (defaultName || name.length === 0) &&
    room.monthlyRent === 0 &&
    !((room.dailyRentPrice ?? 0) > 0) &&
    room.photoDataUrls.length === 0 &&
    !room.videoDataUrl &&
    !room.detail.trim() &&
    !room.roomAmenitiesText.trim() &&
    !room.furnishing.trim() &&
    !(room.moveInAvailableDate ?? "").trim() &&
    !(room.moveInInstructions ?? "").trim() &&
    (room.manualUnavailableRanges ?? []).length === 0 &&
    defaultAvail &&
    util.length === 0
  );
}

export function isBathroomSlotRemovable(bath: ManagerBathroomSubmission): boolean {
  const name = bath.name.trim();
  const defaultName =
    name.length === 0 || name === "Full bath (hall)" || /^Bathroom \d+$/.test(name);
  return (
    defaultName &&
    !bath.location.trim() &&
    !bath.amenitiesText.trim() &&
    bath.photoDataUrls.length === 0 &&
    !bath.videoDataUrl &&
    (bath.assignedRoomIds ?? []).length === 0 &&
    !bath.allResidents
  );
}

/** Map home-step bathroom option id (e.g. "1.5", "4+") to a bathroom card count. */
export function bathroomCountFromListingTotalBathroomsId(id: string | undefined | null): number {
  const raw = (id ?? "").trim();
  if (!raw) return 1;
  if (raw === "4+") return 4;
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.min(12, Math.max(1, Math.ceil(n)));
}

export type ApplyBedroomSlotsResult =
  | { ok: true; sub: ManagerListingSubmissionV1 }
  | { ok: false; message: string };

export function applyListingBedroomSlots(
  sub: ManagerListingSubmissionV1,
  target: number,
): ApplyBedroomSlotsResult {
  const clamped = Math.max(1, Math.min(20, Math.round(target)));
  let rooms = [...sub.rooms];
  if (rooms.length < clamped) {
    while (rooms.length < clamped) rooms.push(emptyRoom(rooms.length));
  } else if (rooms.length > clamped) {
    while (rooms.length > clamped) {
      const last = rooms[rooms.length - 1]!;
      if (!isRoomSlotRemovable(last)) {
        return {
          ok: false,
          message:
            "To list fewer bedrooms, remove or clear the extra room rows (starting from the last one), or raise the bedroom count again.",
        };
      }
      rooms.pop();
    }
  }
  rooms = rooms.map((room, i) => (room.name.trim() ? room : { ...room, name: `Room ${i + 1}` }));
  return { ok: true, sub: { ...sub, rooms, listingBedroomSlots: clamped } };
}

export type ApplyBathroomSlotsResult =
  | { ok: true; sub: ManagerListingSubmissionV1 }
  | { ok: false; message: string };

/** Grow/shrink bathroom cards from the home-step bathroom count; autofill default names. */
export function applyListingBathroomSlots(
  sub: ManagerListingSubmissionV1,
  target?: number,
): ApplyBathroomSlotsResult {
  const clamped = Math.max(
    1,
    Math.min(12, Math.round(target ?? bathroomCountFromListingTotalBathroomsId(sub.listingTotalBathroomsId))),
  );
  let bathrooms = [...sub.bathrooms];
  if (bathrooms.length < clamped) {
    while (bathrooms.length < clamped) bathrooms.push(emptyBathroom(bathrooms.length));
  } else if (bathrooms.length > clamped) {
    while (bathrooms.length > clamped) {
      const last = bathrooms[bathrooms.length - 1]!;
      if (!isBathroomSlotRemovable(last)) {
        return {
          ok: false,
          message:
            "To list fewer bathrooms, remove or clear the extra bathroom rows (starting from the last one), or raise the bathroom count again.",
        };
      }
      bathrooms.pop();
    }
  }
  bathrooms = bathrooms.map((bath, i) =>
    bath.name.trim()
      ? bath
      : { ...bath, name: i === 0 ? "Full bath (hall)" : `Bathroom ${i + 1}` },
  );
  return { ok: true, sub: { ...sub, bathrooms } };
}

/** Best-effort home-step bathroom option id for an existing bathroom card count. */
export function listingTotalBathroomsIdFromCount(count: number): string {
  const n = Math.max(1, Math.min(12, Math.round(count)));
  if (n >= 4) return "4+";
  return String(n);
}

export function createDefaultListingServiceOptions(): ManagerListingServiceOption[] {
  return [];
}

export function createManagerListingServiceOption(name = "", description = ""): ManagerListingServiceOption {
  return {
    id: `offer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    description,
    price: "",
    deposit: "",
    available: true,
    createdAt: new Date().toISOString(),
  };
}

/** One-click presets for the listing services step (not added until the manager chooses). */
export type ListingServiceQuickAdd = {
  name: string;
  description: string;
  /** Suggested recurring price shown when managers add or submit this request type. */
  price?: string;
  /** Suggested deposit when the offering requires one (e.g. equipment rental). */
  deposit?: string;
};

export const LISTING_SERVICE_QUICK_ADDS: ListingServiceQuickAdd[] = [
  {
    name: "Weekly cleaning",
    description: "Regular cleaning of your room or shared areas.",
    price: "$35.00",
  },
  {
    name: "Linen refresh",
    description: "Fresh sheets and towels on request.",
    price: "$20.00",
  },
  {
    name: "Storage locker",
    description: "Personal storage space on the property.",
    price: "$45.00",
    deposit: "$100.00",
  },
];

/** Price/deposit for an offering — uses saved values, then preset defaults by name. */
export function resolveServiceOfferPricing(offer: {
  name: string;
  price?: string;
  deposit?: string;
}): { price: string; deposit: string } {
  const price = offer.price?.trim() ?? "";
  const deposit = offer.deposit?.trim() ?? "";
  if (price || deposit) return { price, deposit };
  const preset = LISTING_SERVICE_QUICK_ADDS.find(
    (p) => p.name.trim().toLowerCase() === offer.name.trim().toLowerCase(),
  );
  return { price: preset?.price?.trim() ?? "", deposit: preset?.deposit?.trim() ?? "" };
}

export function createDefaultListingSubmission(): ManagerListingSubmissionV1 {
  return {
    v: 1,
    buildingName: "",
    address: "",
    zip: "",
    neighborhood: "",
    homeStructureNote: "",
    listingPropertyTypeId: "",
    listingPlaceCategoryId: "shared_home",
    listingStoriesId: "",
    listingTotalBathroomsId: "",
    listingBedroomSlots: 1,
    tagline: "",
    petFriendly: false,
    houseOverview: "",
    housePhotoDataUrls: [],
    houseVideoDataUrl: null,
    houseRulesText: "",
    wifiNetworkName: "",
    wifiPassword: "",
    leaseTermsBody: "",
    allowedLeaseTerms: [],
    shortTermRentalsAllowed: false,
    shortTermRequirements: "",
    shortTermDailyCost: "",
    shortTermDeposit: "",
    applicationFee: "",
    securityDeposit: "",
    moveInFee: "",
    paymentAtSigningIncludes: ["security_deposit", "move_in_fee"],
    houseCostsDetail: "",
    parkingMonthly: "",
    hoaMonthly: "",
    otherMonthlyFees: "",
    sharedSpaces: [],
    amenitiesText: "",
    zellePaymentsEnabled: false,
    zelleContact: "",
    venmoPaymentsEnabled: false,
    venmoContact: "",
    achPaymentLinkEnabled: false,
    achPaymentLink: "",
    applicationFeeStripeEnabled: true,
    applicationFeeZelleEnabled: false,
    applicationFeeVenmoEnabled: false,
    applicationFeeOtherEnabled: false,
    applicationFeeOtherInstructions: "",
    houseMoveInAvailableDate: "",
    houseMoveInInstructions: "",
    rentDueDayMode: "first_of_month",
    lateFeeEnabled: true,
    lateFeeGraceDays: 5,
    lateFeeAmount: "50",
    axisPaymentsEnabled: true,
    rooms: [{ ...emptyRoom(0), name: "", availability: "" }],
    bathrooms: [],
    bundles: [],
    quickFacts: [],
    customFees: [],
    serviceRequestOptions: [],
    customApplicationFields: [],
    disabledStandardApplicationKeys: [],
    applicationConfigMode: "standard",
    leaseConfigMode: "standard",
    leaseCustomKind: "terms",
    customLeaseTerms: "",
    leaseTemplateDocUrl: null,
    leaseTemplateDocName: "",
  };
}

/** Rebuild a v1 submission from legacy single-unit admin rows (demo bucket round-trips). */
export function legacyAdminFieldsToSubmission(row: {
  buildingName: string;
  address: string;
  zip: string;
  neighborhood: string;
  unitLabel: string;
  beds: number;
  baths: number;
  monthlyRent: number;
  petFriendly: boolean;
  tagline: string;
}): ManagerListingSubmissionV1 {
  const sub = createDefaultListingSubmission();
  sub.buildingName = row.buildingName;
  sub.address = row.address;
  sub.zip = row.zip;
  sub.neighborhood = row.neighborhood;
  sub.tagline = row.tagline;
  sub.petFriendly = row.petFriendly;
  sub.rooms = [{ ...emptyRoom(0), name: row.unitLabel, monthlyRent: row.monthlyRent }];
  const nBaths = Math.max(1, Math.min(Math.floor(row.baths) || 1, 12));
  sub.bathrooms = Array.from({ length: nBaths }, (_, i) => emptyBathroom(i));
  return sub;
}
