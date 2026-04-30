/**
 * Per-resident charge lines (application fee, security deposit, etc.) tied to listings.
 * Supabase is the persistence layer; this module keeps only in-memory page-session state.
 */

import { getPropertyById, parseRoomChoiceValue } from "@/lib/rental-application/data";
import { parseMoneyAmount } from "@/lib/parse-money";
import { paymentAtSigningPriceLabel } from "@/lib/rental-application/listing-fees-display";
import { normalizeManagerListingSubmissionV1, type ManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";
import type { DemoManagerPaymentLedgerRow, ManagerPaymentBucket } from "@/data/demo-portal";
import type { DemoApplicantRow } from "@/data/demo-portal";

export const HOUSEHOLD_CHARGES_EVENT = "axis:household-charges";

let memoryCharges: HouseholdCharge[] = [];
let memoryRentProfiles: RecurringRentProfile[] = [];
const HOUSEHOLD_CHARGES_SYNC_TTL_MS = 15_000;
let householdChargesLastSyncedAt = 0;
let householdChargesSyncPromise: Promise<{ charges: HouseholdCharge[]; rentProfiles: RecurringRentProfile[] }> | null = null;
const HOUSEHOLD_CHARGES_SESSION_KEY = "axis:household-charges:v1";
const HOUSEHOLD_RENT_PROFILES_SESSION_KEY = "axis:household-rent-profiles:v1";

function chargesChanged(a: HouseholdCharge[], b: HouseholdCharge[]) {
  return JSON.stringify(dedupeCharges(a)) !== JSON.stringify(dedupeCharges(b));
}

function rentProfilesChanged(a: RecurringRentProfile[], b: RecurringRentProfile[]) {
  return JSON.stringify(dedupeRecurringRentProfiles(a)) !== JSON.stringify(dedupeRecurringRentProfiles(b));
}

/** When no manager Supabase session, work-order pass-through charges use this scope so Payments still lists them. */
export const HOUSEHOLD_CHARGE_DEMO_MANAGER_SCOPE = "__axis_demo_manager_scope__";

export type HouseholdChargeKind =
  | "application_fee"
  | "first_month_rent"
  | "prorated_rent"
  | "rent"
  | "utilities"
  | "prorated_utilities"
  | "security_deposit"
  | "move_in_fee"
  | "other_cost"
  | "payment_at_signing"
  | "work_order_charge";

export type HouseholdCharge = {
  id: string;
  createdAt: string;
  applicationId?: string;
  residentEmail: string;
  residentName: string;
  residentUserId: string | null;
  propertyId: string;
  propertyLabel: string;
  managerUserId: string | null;
  kind: HouseholdChargeKind;
  title: string;
  amountLabel: string;
  balanceLabel: string;
  status: "pending" | "paid";
  paidAt?: string;
  /** Snapshot of Zelle / SMS contact from listing when charge was created */
  zelleContactSnapshot?: string;
  /** Snapshot of Venmo contact from listing when charge was created */
  venmoContactSnapshot?: string;
  /** When true, lease signing stays disabled until this line is paid */
  blocksLeaseUntilPaid: boolean;
  /** When this charge was created from a manager work order pass-through */
  workOrderId?: string;
  recurringRentProfileId?: string;
  rentMonth?: string;
  dueDay?: number;
  dueDateLabel?: string;
};

export type RecurringRentProfile = {
  id: string;
  residentEmail: string;
  residentName: string;
  residentUserId: string | null;
  propertyId: string;
  propertyLabel: string;
  roomLabel: string;
  managerUserId: string | null;
  monthlyRent: number;
  dueDay: number;
  startMonth: string;
  active: boolean;
  updatedAt: string;
};

const FUTURE_RENT_VISIBILITY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function isBrowser() {
  return typeof window !== "undefined";
}

function hydrateHouseholdStateFromSession() {
  if (!isBrowser()) return;
  try {
    if (memoryCharges.length === 0) {
      const rawCharges = window.sessionStorage.getItem(HOUSEHOLD_CHARGES_SESSION_KEY);
      if (rawCharges) {
        const parsed = JSON.parse(rawCharges) as HouseholdCharge[];
        if (Array.isArray(parsed)) memoryCharges = dedupeCharges(parsed);
      }
    }
    if (memoryRentProfiles.length === 0) {
      const rawProfiles = window.sessionStorage.getItem(HOUSEHOLD_RENT_PROFILES_SESSION_KEY);
      if (rawProfiles) {
        const parsed = JSON.parse(rawProfiles) as RecurringRentProfile[];
        if (Array.isArray(parsed)) memoryRentProfiles = dedupeRecurringRentProfiles(parsed);
      }
    }
  } catch {
    /* ignore */
  }
}

function persistHouseholdStateToSession() {
  if (!isBrowser()) return;
  try {
    window.sessionStorage.setItem(HOUSEHOLD_CHARGES_SESSION_KEY, JSON.stringify(memoryCharges));
    window.sessionStorage.setItem(HOUSEHOLD_RENT_PROFILES_SESSION_KEY, JSON.stringify(memoryRentProfiles));
  } catch {
    /* ignore */
  }
}

function emit() {
  if (!isBrowser()) return;
  window.dispatchEvent(new Event(HOUSEHOLD_CHARGES_EVENT));
}

function postHouseholdPayload(body: unknown) {
  void body;
}

function deleteChargeRowFromServer(id: string) {
  postHouseholdPayload({ action: "deleteCharge", id });
}

function mirrorChargeRows(rows: HouseholdCharge[]) {
  postHouseholdPayload({ action: "replace", charges: rows, rentProfiles: readRentProfiles() });
}

function mirrorRentProfiles(rows: RecurringRentProfile[]) {
  postHouseholdPayload({ action: "replace", charges: readAll(), rentProfiles: rows });
}

export async function syncHouseholdChargesFromServer(): Promise<{
  charges: HouseholdCharge[];
  rentProfiles: RecurringRentProfile[];
}> {
  if (!isBrowser()) return { charges: [], rentProfiles: [] };
  if (householdChargesSyncPromise) return householdChargesSyncPromise;
  if (householdChargesLastSyncedAt > 0 && Date.now() - householdChargesLastSyncedAt < HOUSEHOLD_CHARGES_SYNC_TTL_MS) {
    return { charges: readAll(), rentProfiles: readRentProfiles() };
  }
  householdChargesSyncPromise = Promise.resolve().then(() => {
    hydrateHouseholdStateFromSession();
    return { charges: readAll(), rentProfiles: readRentProfiles() };
  });
  const result = await householdChargesSyncPromise;
  householdChargesLastSyncedAt = Date.now();
  householdChargesSyncPromise = null;
  return result;
}

function readAll(): HouseholdCharge[] {
  hydrateHouseholdStateFromSession();
  return isBrowser() ? memoryCharges : [];
}

function writeAll(rows: HouseholdCharge[], silent = false) {
  if (!isBrowser()) return;
  const normalized = dedupeCharges(rows);
  if (!chargesChanged(memoryCharges, normalized)) return;
  memoryCharges = normalized;
  persistHouseholdStateToSession();
  householdChargesLastSyncedAt = Date.now();
  mirrorChargeRows(normalized);
  if (!silent) emit();
}

function readRentProfiles(): RecurringRentProfile[] {
  hydrateHouseholdStateFromSession();
  return isBrowser() ? memoryRentProfiles : [];
}

function writeRentProfiles(rows: RecurringRentProfile[]) {
  if (!isBrowser()) return;
  const normalized = dedupeRecurringRentProfiles(rows);
  if (!rentProfilesChanged(memoryRentProfiles, normalized)) return;
  memoryRentProfiles = normalized;
  persistHouseholdStateToSession();
  householdChargesLastSyncedAt = Date.now();
  mirrorRentProfiles(normalized);
  syncAllRecurringRentCharges();
  emit();
}

export { parseMoneyAmount } from "@/lib/parse-money";

function currentRentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function chargeKeyPart(raw: string): string {
  const cleaned = raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned || "unknown";
}

function applicationFeeChargeIdForApplication(applicationId: string): string {
  return `hc_app_fee_${chargeKeyPart(applicationId)}`;
}

function applicationFeeFallbackChargeId(residentEmail: string, propertyId: string): string {
  return `hc_app_fee_${chargeKeyPart(residentEmail)}_${chargeKeyPart(propertyId)}`;
}

function approvedChargeId(applicationId: string, kind: HouseholdChargeKind): string {
  return `hc_app_${chargeKeyPart(applicationId)}_${kind}`;
}

function recurringRentProfileKey(profile: Pick<RecurringRentProfile, "residentEmail" | "propertyId">): string {
  return `${profile.residentEmail.trim().toLowerCase()}|${profile.propertyId}`;
}

function dedupeRecurringRentProfiles(rows: RecurringRentProfile[]): RecurringRentProfile[] {
  const byKey = new Map<string, RecurringRentProfile>();
  for (const profile of rows) {
    const key = recurringRentProfileKey(profile);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, profile);
      continue;
    }
    const existingUpdatedAt = new Date(existing.updatedAt).getTime();
    const nextUpdatedAt = new Date(profile.updatedAt).getTime();
    if (!Number.isFinite(existingUpdatedAt) || nextUpdatedAt >= existingUpdatedAt) {
      byKey.set(key, profile);
    }
  }
  return [...byKey.values()];
}

function chargeBusinessKey(charge: HouseholdCharge): string {
  if (charge.kind === "rent") {
    return `rent|${charge.residentEmail.trim().toLowerCase()}|${charge.propertyId}|${charge.rentMonth ?? ""}`;
  }
  if (charge.applicationId && (
    charge.kind === "application_fee" ||
    charge.kind === "first_month_rent" ||
    charge.kind === "prorated_rent" ||
    charge.kind === "utilities" ||
    charge.kind === "prorated_utilities" ||
    charge.kind === "security_deposit" ||
    charge.kind === "move_in_fee" ||
    charge.kind === "other_cost"
  )) {
    return `${charge.kind}|${charge.applicationId}`;
  }
  return charge.id;
}

function dedupeCharges(rows: HouseholdCharge[]): HouseholdCharge[] {
  const byKey = new Map<string, HouseholdCharge>();
  for (const charge of rows) {
    const key = chargeBusinessKey(charge);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, charge);
      continue;
    }
    if (existing.status !== "paid" && charge.status === "paid") {
      byKey.set(key, charge);
      continue;
    }
    const existingCreatedAt = new Date(existing.createdAt).getTime();
    const nextCreatedAt = new Date(charge.createdAt).getTime();
    if (!Number.isFinite(existingCreatedAt) || nextCreatedAt >= existingCreatedAt) {
      byKey.set(key, charge);
    }
  }
  return [...byKey.values()];
}

function formatRecurringRentDueLabel(month: string, dueDay: number) {
  const [year, monthIndex] = month.split("-").map(Number);
  const dt = new Date(year!, (monthIndex ?? 1) - 1, dueDay, 12, 0, 0, 0);
  return Number.isNaN(dt.getTime())
    ? `${month}-${String(dueDay).padStart(2, "0")}`
    : dt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function recurringRentDueDate(month: string | undefined, dueDay: number | undefined): Date | null {
  if (!month) return null;
  const [year, monthIndex] = month.split("-").map(Number);
  const day = Math.min(28, Math.max(1, Math.round(dueDay ?? 1)));
  const dt = new Date(year!, (monthIndex ?? 1) - 1, day, 12, 0, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function dueLabelForLeaseStart(leaseStart?: string | null): string {
  const raw = leaseStart?.trim();
  if (!raw) return "Before move-in";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "Before move-in";
  return `Before ${date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
}

function shouldDisplayChargeInPayments(charge: HouseholdCharge, now = new Date()): boolean {
  if (charge.status === "paid") return true;
  switch (charge.kind) {
    case "rent": {
      const due = recurringRentDueDate(charge.rentMonth, charge.dueDay);
      if (!due) return true;
      return due.getTime() - now.getTime() <= FUTURE_RENT_VISIBILITY_WINDOW_MS;
    }
    default:
      return true;
  }
}

export function chargeDueLabel(charge: HouseholdCharge): string {
  if (charge.dueDateLabel?.trim()) return charge.dueDateLabel.trim();
  if (charge.kind === "rent" && charge.rentMonth) {
    return formatRecurringRentDueLabel(charge.rentMonth, charge.dueDay ?? 1);
  }
  switch (charge.kind) {
    case "application_fee":
      return "Before approval";
    case "security_deposit":
    case "move_in_fee":
      return "Before lease signing";
    case "first_month_rent":
    case "prorated_rent":
    case "utilities":
    case "prorated_utilities":
      return "Before move-in";
    default:
      return new Date(charge.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }
}

function chargeTitle(kind: HouseholdChargeKind): string {
  switch (kind) {
    case "application_fee":
      return "Application fee";
    case "first_month_rent":
      return "First month's rent";
    case "prorated_rent":
      return "Prorated first month's rent";
    case "rent":
      return "Monthly rent";
    case "utilities":
      return "Utilities";
    case "prorated_utilities":
      return "Prorated utilities";
    case "security_deposit":
      return "Security deposit";
    case "move_in_fee":
      return "Move-in cost";
    case "other_cost":
      return "Other cost";
    case "payment_at_signing":
      return "Payment due at signing";
    case "work_order_charge":
      return "Work order charge";
    default:
      return "Charge";
  }
}

function submissionAmount(sub: ManagerListingSubmissionV1, kind: HouseholdChargeKind): string {
  switch (kind) {
    case "application_fee":
      return sub.applicationFee;
    case "first_month_rent":
    case "prorated_rent":
    case "prorated_utilities":
    case "rent":
      return "$0";
    case "utilities":
      return "$0";
    case "security_deposit":
      return sub.securityDeposit;
    case "move_in_fee":
      return sub.moveInFee;
    case "other_cost":
      return "$0";
    case "payment_at_signing":
      return paymentAtSigningPriceLabel(sub);
    case "work_order_charge":
      return "$0";
    default:
      return "$0";
  }
}

function moneyAmountLabel(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function leaseStartProration(leaseStart: string | undefined): { prorated: boolean; factor: number; label: string } {
  if (!leaseStart?.trim()) return { prorated: false, factor: 1, label: "full first month" };
  const [yearRaw, monthRaw, dayRaw] = leaseStart.split("-").map(Number);
  if (!yearRaw || !monthRaw || !dayRaw) return { prorated: false, factor: 1, label: "full first month" };
  const daysInMonth = new Date(yearRaw, monthRaw, 0).getDate();
  if (!Number.isFinite(daysInMonth) || daysInMonth <= 0 || dayRaw <= 1) {
    return { prorated: false, factor: 1, label: "full first month" };
  }
  const billableDays = Math.max(1, daysInMonth - dayRaw + 1);
  return {
    prorated: true,
    factor: billableDays / daysInMonth,
    label: `${billableDays}/${daysInMonth} days from lease start`,
  };
}

function firstMonthRentChargeForLeaseStart(
  monthlyRent: number,
  leaseStart: string | undefined,
): {
  kind: HouseholdChargeKind;
  amount: number;
  title: string;
  proration: ReturnType<typeof leaseStartProration>;
} {
  const proration = leaseStartProration(leaseStart);
  const amount = proration.prorated ? monthlyRent * proration.factor : monthlyRent;
  return {
    kind: proration.prorated ? "prorated_rent" : "first_month_rent",
    amount,
    title: proration.prorated ? "Prorated first month's rent" : "First month's rent",
    proration,
  };
}

function selectedRoomUtilities(row: Pick<DemoApplicantRow, "assignedRoomChoice" | "application" | "propertyId" | "assignedPropertyId">): {
  raw: string;
  amount: number;
} {
  const override = row.application?.managerUtilitiesOverride?.trim();
  if (override != null && override !== "") return { raw: override, amount: parseMoneyAmount(override) };
  const choice = row.assignedRoomChoice?.trim() || row.application?.roomChoice1?.trim() || "";
  const propertyId = row.assignedPropertyId?.trim() || row.propertyId?.trim() || row.application?.propertyId?.trim() || "";
  const prop = getPropertyById(propertyId);
  const sub = prop?.listingSubmission?.v === 1 ? normalizeManagerListingSubmissionV1(prop.listingSubmission) : null;
  if (!sub) return { raw: "", amount: 0 };
  const { listingRoomId } = parseRoomChoiceValue(choice);
  const room = listingRoomId ? sub.rooms.find((r) => r.id === listingRoomId) : null;
  const raw = room?.utilitiesEstimate?.trim() || "";
  return { raw, amount: parseMoneyAmount(raw) };
}

function selectedRoomRentAmount(row: DemoApplicantRow): number {
  const override = row.application?.managerRentOverride?.trim();
  if (override) {
    const amount = parseMoneyAmount(override);
    if (amount > 0) return amount;
  }
  const signedRent = Number(row.signedMonthlyRent ?? 0);
  if (Number.isFinite(signedRent) && signedRent > 0) return signedRent;
  const choice = row.assignedRoomChoice?.trim() || row.application?.roomChoice1?.trim() || "";
  const propertyId = row.assignedPropertyId?.trim() || row.propertyId?.trim() || row.application?.propertyId?.trim() || "";
  const prop = getPropertyById(propertyId);
  const sub = prop?.listingSubmission?.v === 1 ? normalizeManagerListingSubmissionV1(prop.listingSubmission) : null;
  if (!sub) return 0;
  const { listingRoomId } = parseRoomChoiceValue(choice);
  const room = listingRoomId ? sub.rooms.find((r) => r.id === listingRoomId) : null;
  return room?.monthlyRent && room.monthlyRent > 0 ? room.monthlyRent : 0;
}

export function findPendingWorkOrderCharge(workOrderId: string): HouseholdCharge | undefined {
  return readAll().find((c) => c.workOrderId === workOrderId && c.kind === "work_order_charge" && c.status === "pending");
}

/** Removes pending pass-through lines tied to a work order (e.g. when the manager deletes the work order). */
export function removePendingWorkOrderChargesForWorkOrder(workOrderId: string): void {
  if (!isBrowser() || !workOrderId.trim()) return;
  const rows = readAll();
  const next = rows.filter(
    (r) =>
      !(
        r.workOrderId === workOrderId &&
        r.kind === "work_order_charge" &&
        r.status === "pending"
      ),
  );
  if (next.length !== rows.length) writeAll(next);
}

export function findApplicationFeeCharge(
  residentEmail: string,
  propertyId: string,
  residentUserId?: string | null,
  applicationId?: string | null,
): HouseholdCharge | undefined {
  const e = residentEmail.trim().toLowerCase();
  return readAll().find((r) => {
    if (r.kind !== "application_fee") return false;
    if (applicationId?.trim() && r.applicationId === applicationId.trim()) return true;
    if (r.propertyId !== propertyId) return false;
    if (r.residentEmail.trim().toLowerCase() === e) return true;
    if (residentUserId && r.residentUserId === residentUserId) return true;
    return false;
  });
}

/** Removes a pending application-fee line (e.g. after promo waive) so managers do not see a stray unpaid fee. */
export function removePendingApplicationFeeCharge(residentEmail: string, propertyId: string): void {
  const e = residentEmail.trim().toLowerCase();
  const rows = readAll();
  const next = rows.filter(
    (r) =>
      !(
        r.kind === "application_fee" &&
        r.propertyId === propertyId &&
        r.residentEmail.trim().toLowerCase() === e &&
        r.status === "pending"
      )
  );
  if (next.length !== rows.length) writeAll(next);
}

/**
 * Dollar amount the listing expects for the application fee (0 = none / not required for gate).
 * When there is no manager submission on the property, the demo stack uses $50 to match legacy billing.
 */
export function listingApplicationFeeAmount(propertyId: string): { amount: number; displayLabel: string } {
  if (!propertyId.trim()) {
    return { amount: 0, displayLabel: "—" };
  }
  const prop = getPropertyById(propertyId);
  const sub = prop?.listingSubmission;
  if (!sub) {
    return { amount: 50, displayLabel: "$50" };
  }
  const raw = submissionAmount(sub, "application_fee");
  const amount = parseMoneyAmount(raw);
  const displayLabel = raw.trim() || (amount > 0 ? `$${amount.toFixed(2)}` : "—");
  return { amount, displayLabel };
}

/**
 * Ensures a pending application-fee line exists when the listing requires a fee, so the applicant can pay
 * (e.g. Zelle or Venmo) and the manager can mark it paid before the wizard finalizes and shows an Axis ID.
 */
export function ensurePendingApplicationFeeCharge(input: {
  residentEmail: string;
  residentName: string;
  residentUserId: string | null;
  propertyId: string;
  applicationId?: string | null;
  managerUserId?: string | null;
}): HouseholdCharge | null {
  const email = input.residentEmail.trim();
  if (!email || !email.includes("@")) return null;
  const prop = getPropertyById(input.propertyId);
  const sub = prop?.listingSubmission;
  let raw = sub ? submissionAmount(sub, "application_fee") : "";
  let amt = parseMoneyAmount(raw);
  if (!sub && amt <= 0) {
    raw = "$50";
    amt = 50;
  }
  if (amt <= 0) return null;

  const existing = findApplicationFeeCharge(email, input.propertyId, input.residentUserId, input.applicationId);
  if (existing) return existing;

  const zelleSnap =
    sub && sub.zellePaymentsEnabled && sub.zelleContact?.trim() ? sub.zelleContact.trim() : undefined;
  const venmoSnap =
    sub && sub.venmoPaymentsEnabled && sub.venmoContact?.trim() ? sub.venmoContact.trim() : undefined;

  const label = raw.trim() || `$${amt.toFixed(2)}`;
  const charge: HouseholdCharge = {
    id: input.applicationId?.trim()
      ? applicationFeeChargeIdForApplication(input.applicationId.trim())
      : applicationFeeFallbackChargeId(email, input.propertyId),
    createdAt: new Date().toISOString(),
    applicationId: input.applicationId?.trim() || undefined,
    residentEmail: email,
    residentName: input.residentName.trim() || "Applicant",
    residentUserId: input.residentUserId,
    propertyId: input.propertyId,
    propertyLabel: prop?.title ?? (sub ? sub.buildingName : "Listing"),
    managerUserId: input.managerUserId ?? prop?.managerUserId ?? null,
    kind: "application_fee",
    title: chargeTitle("application_fee"),
    amountLabel: label,
    balanceLabel: label.includes("$") ? label : `$${amt.toFixed(2)}`,
    status: "pending",
    zelleContactSnapshot: zelleSnap,
    venmoContactSnapshot: venmoSnap,
    blocksLeaseUntilPaid: false,
  };
  writeAll([...readAll(), charge]);
  return charge;
}

/**
 * Bill a resident for work order cost (pass-through). Creates a pending line on manager Payments and resident Payments.
 */
export function recordWorkOrderResidentCharge(input: {
  managerUserId: string;
  workOrderId: string;
  propertyLabel: string;
  unit: string;
  workOrderTitle: string;
  /** Raw amount e.g. "75", "$75", "75.00" */
  amountInput: string;
  residentEmail: string;
  residentName: string;
  zelleContactSnapshot?: string | null;
}): HouseholdCharge | null {
  const amt = parseMoneyAmount(input.amountInput);
  if (amt <= 0) return null;
  const email = input.residentEmail.trim().toLowerCase();
  if (!email || !email.includes("@")) return null;

  const existing = findPendingWorkOrderCharge(input.workOrderId);
  if (existing) {
    return null;
  }

  const balance = `$${amt.toFixed(2)}`;
  const charge: HouseholdCharge = {
    id: `hc_wo_${input.workOrderId}_${Date.now()}`,
    createdAt: new Date().toISOString(),
    residentEmail: input.residentEmail.trim(),
    residentName: input.residentName.trim() || "Resident",
    residentUserId: null,
    propertyId: `workorder:${input.workOrderId}`,
    propertyLabel: `${input.propertyLabel} · ${input.unit}`,
    managerUserId: input.managerUserId,
    kind: "work_order_charge",
    title: `Work order · ${input.workOrderTitle}`,
    amountLabel: balance,
    balanceLabel: balance,
    status: "pending",
    zelleContactSnapshot: input.zelleContactSnapshot ?? undefined,
    blocksLeaseUntilPaid: false,
    workOrderId: input.workOrderId,
  };
  writeAll([...readAll(), charge]);
  return charge;
}

function syncAllRecurringRentCharges(): boolean {
  return false;
}

export function readRecurringRentProfilesForManager(managerUserId: string | null): RecurringRentProfile[] {
  const scope = managerUserId ?? HOUSEHOLD_CHARGE_DEMO_MANAGER_SCOPE;
  return readRentProfiles().filter((profile) => profile.managerUserId === scope && profile.active);
}

export function upsertRecurringRentProfile(input: {
  residentEmail: string;
  residentName: string;
  residentUserId?: string | null;
  propertyId: string;
  propertyLabel: string;
  roomLabel: string;
  managerUserId: string | null;
  monthlyRent: number;
  dueDay?: number;
  startMonth?: string;
}): RecurringRentProfile | null {
  void input;
  return null;
}

/** Link charges created with email-only to the signed-in resident account. */
export function linkHouseholdChargesToResidentUser(email: string, userId: string) {
  const e = email.trim().toLowerCase();
  if (!e || !userId) return;
  const rows = readAll();
  let changed = false;
  const next = rows.map((r) => {
    if (r.residentEmail.trim().toLowerCase() === e && r.residentUserId !== userId) {
      changed = true;
      return { ...r, residentUserId: userId };
    }
    return r;
  });
  if (changed) writeAll(next);

  const profiles = readRentProfiles();
  let profileChanged = false;
  const nextProfiles = profiles.map((profile) => {
    if (profile.residentEmail.trim().toLowerCase() === e && profile.residentUserId !== userId) {
      profileChanged = true;
      return { ...profile, residentUserId: userId };
    }
    return profile;
  });
  if (profileChanged) writeRentProfiles(nextProfiles);
}

export function readChargesForResident(email: string, userId: string | null): HouseholdCharge[] {
  const e = email.trim().toLowerCase();
  return dedupeCharges(readAll())
    .filter((r) => {
      if (userId && r.residentUserId === userId) return true;
      return Boolean(e && r.residentEmail.trim().toLowerCase() === e);
    })
    .filter((charge) => shouldDisplayChargeInPayments(charge));
}

export function readChargesForManager(managerUserId: string | null): HouseholdCharge[] {
  const scope = managerUserId ?? HOUSEHOLD_CHARGE_DEMO_MANAGER_SCOPE;
  return dedupeCharges(readAll())
    .filter((r) => r.managerUserId === scope)
    .filter((charge) => shouldDisplayChargeInPayments(charge));
}

export function deleteHouseholdCharge(chargeId: string, managerUserId: string | null): boolean {
  if (!isBrowser()) return false;
  const rows = readAll();
  const scope = managerUserId ?? HOUSEHOLD_CHARGE_DEMO_MANAGER_SCOPE;
  const idx = rows.findIndex((r) => r.id === chargeId && r.managerUserId === scope);
  if (idx === -1) return false;
  deleteChargeRowFromServer(chargeId);
  writeAll(rows.filter((_, i) => i !== idx));
  return true;
}

export function markHouseholdChargePaid(chargeId: string, managerUserId: string | null): boolean {
  const rows = readAll();
  const scope = managerUserId ?? HOUSEHOLD_CHARGE_DEMO_MANAGER_SCOPE;
  const i = rows.findIndex((r) => r.id === chargeId && r.managerUserId === scope);
  if (i === -1) return false;
  if (rows[i]!.status === "paid") return true;
  const now = new Date().toISOString();
  const next = [...rows];
  next[i] = { ...next[i]!, status: "paid", paidAt: now, balanceLabel: "$0.00" };
  writeAll(next);
  return true;
}

/**
 * Marks the pending application-fee line paid after the applicant completes card payment (Stripe) in the apply flow.
 * Demo: simulates an immediate successful charge so submit can proceed without a manager action.
 */
export function markApplicationFeePaidAfterStripe(residentEmail: string, propertyId: string, residentUserId: string | null): boolean {
  const charge = findApplicationFeeCharge(residentEmail, propertyId, residentUserId);
  if (!charge || charge.kind !== "application_fee") return false;
  if (charge.status === "paid") return true;
  const rows = readAll();
  const i = rows.findIndex((r) => r.id === charge.id);
  if (i === -1) return false;
  const now = new Date().toISOString();
  const next = [...rows];
  next[i] = { ...next[i]!, status: "paid", paidAt: now, balanceLabel: "$0.00" };
  writeAll(next);
  return true;
}

/**
 * Called when an applicant completes the rental wizard (step 12).
 * Creates/tracks the application fee only. Lease/payment lines are created once the application is approved.
 */
export function recordApplicationCharges(
  input: {
    residentEmail: string;
    residentName: string;
    residentUserId: string | null;
    propertyId: string;
    applicationId?: string | null;
    managerUserId?: string | null;
  },
  opts?: { skipApplicationFee?: boolean }
): void {
  const existingAppFee = findApplicationFeeCharge(
    input.residentEmail,
    input.propertyId,
    input.residentUserId,
  );

  const prop = getPropertyById(input.propertyId);
  const sub = prop?.listingSubmission;
  if (!sub) {
    if (opts?.skipApplicationFee || existingAppFee) return;
    /* still record a generic application fee line using defaults */
    const fallback: HouseholdCharge = {
      id: input.residentEmail.trim() && input.propertyId.trim()
        ? applicationFeeFallbackChargeId(input.residentEmail.trim(), input.propertyId.trim())
        : `hc_app_${Date.now()}`,
      createdAt: new Date().toISOString(),
      residentEmail: input.residentEmail.trim(),
      residentName: input.residentName.trim(),
      residentUserId: input.residentUserId,
      propertyId: input.propertyId,
      propertyLabel: prop?.title ?? "Listing",
      managerUserId: input.managerUserId ?? prop?.managerUserId ?? null,
      kind: "application_fee",
      title: chargeTitle("application_fee"),
      amountLabel: "$50",
      balanceLabel: "$50.00",
      status: "pending",
      blocksLeaseUntilPaid: false,
    };
    writeAll([...readAll(), fallback]);
    return;
  }

  if (opts?.skipApplicationFee || existingAppFee) return;
  ensurePendingApplicationFeeCharge(input);
}

export function recordSubmittedApplicationFeeCharge(row: DemoApplicantRow, managerUserId: string | null): boolean {
  if (!isBrowser()) return false;
  const residentEmail = row.email?.trim();
  if (!residentEmail || !residentEmail.includes("@")) return false;
  const propertyId = row.assignedPropertyId?.trim() || row.propertyId?.trim() || row.application?.propertyId?.trim() || "";
  if (!propertyId) return false;
  const beforeIds = new Set(readAll().map((charge) => charge.id));
  const charge = ensurePendingApplicationFeeCharge({
    residentEmail,
    residentName: row.name || row.application?.fullLegalName || "Applicant",
    residentUserId: null,
    propertyId,
    applicationId: row.id,
    managerUserId: managerUserId ?? row.managerUserId ?? null,
  });
  return Boolean(charge && !beforeIds.has(charge.id));
}

export function recordApprovedApplicationCharges(row: DemoApplicantRow, managerUserId: string | null): boolean {
  if (!isBrowser()) return false;
  const residentEmail = row.email?.trim();
  if (!residentEmail || !residentEmail.includes("@")) return false;
  const applicationId = row.id.trim();
  if (!applicationId) return false;
  const propertyId = row.assignedPropertyId?.trim() || row.propertyId?.trim() || row.application?.propertyId?.trim() || "";
  if (!propertyId) return false;

  const prop = getPropertyById(propertyId);
  const sub = prop?.listingSubmission?.v === 1 ? normalizeManagerListingSubmissionV1(prop.listingSubmission) : null;
  const residentName = row.name?.trim() || row.application?.fullLegalName?.trim() || "Resident";
  const propertyLabel = prop?.title ?? row.property ?? "Listing";
  const effectiveManagerUserId = managerUserId ?? row.managerUserId ?? prop?.managerUserId ?? null;
  const zelleSnap = sub?.zellePaymentsEnabled && sub.zelleContact?.trim() ? sub.zelleContact.trim() : undefined;
  const venmoSnap = sub?.venmoPaymentsEnabled && sub.venmoContact?.trim() ? sub.venmoContact.trim() : undefined;
  const leaseStart = row.application?.leaseStart?.trim() || undefined;
  const moveInDue = dueLabelForLeaseStart(leaseStart);
  const savedAmount = (raw: string | undefined, fallback: string | undefined): number => {
    const value = raw?.trim();
    if (value != null && value !== "") return parseMoneyAmount(value);
    return parseMoneyAmount(fallback ?? "");
  };
  const before = readAll();
  recordSubmittedApplicationFeeCharge(row, effectiveManagerUserId);
  const rows = readAll().filter(
    (charge) => !(charge.applicationId === applicationId && charge.kind !== "application_fee"),
  );
  const existingKeys = new Set(rows.map((charge) => chargeBusinessKey(charge)));
  const created: HouseholdCharge[] = [];

  const pushCharge = (
    kind: HouseholdChargeKind,
    amount: number,
    title: string,
    blocksLeaseUntilPaid: boolean,
    dueDateLabel = moveInDue,
  ) => {
    if (!(amount > 0)) return;
    const label = moneyAmountLabel(Number(amount.toFixed(2)));
    const charge: HouseholdCharge = {
      id: approvedChargeId(applicationId, kind),
      createdAt: new Date().toISOString(),
      applicationId,
      residentEmail,
      residentName,
      residentUserId: null,
      propertyId,
      propertyLabel,
      managerUserId: effectiveManagerUserId,
      kind,
      title,
      amountLabel: label,
      balanceLabel: label,
      status: "pending",
      zelleContactSnapshot: zelleSnap,
      venmoContactSnapshot: venmoSnap,
      blocksLeaseUntilPaid,
      dueDateLabel,
    };
    const key = chargeBusinessKey(charge);
    if (existingKeys.has(key)) return;
    existingKeys.add(key);
    created.push(charge);
  };

  const rentAmount = selectedRoomRentAmount(row);
  if (rentAmount > 0) {
    const rentCharge = firstMonthRentChargeForLeaseStart(rentAmount, leaseStart);
    pushCharge(rentCharge.kind, rentCharge.amount, rentCharge.title, true, moveInDue);
  }

  const utilities = selectedRoomUtilities(row);
  if (utilities.amount > 0) {
    const proration = leaseStartProration(leaseStart);
    pushCharge(
      proration.prorated ? "prorated_utilities" : "utilities",
      proration.prorated ? utilities.amount * proration.factor : utilities.amount,
      proration.prorated ? "Prorated utilities" : "Utilities",
      false,
      moveInDue,
    );
  }

  const securityDeposit = savedAmount(row.application?.managerSecurityDepositOverride, sub?.securityDeposit);
  pushCharge("security_deposit", securityDeposit, chargeTitle("security_deposit"), true, "Before lease signing");

  const moveInFee = savedAmount(row.application?.managerMoveInFeeOverride, sub?.moveInFee);
  pushCharge("move_in_fee", moveInFee, chargeTitle("move_in_fee"), false, "Before move-in");

  const otherCostAmount = parseMoneyAmount(row.application?.managerOtherCostAmount ?? "");
  if (otherCostAmount > 0) {
    const otherCostTitle = row.application?.managerOtherCostLabel?.trim() || chargeTitle("other_cost");
    pushCharge("other_cost", otherCostAmount, otherCostTitle, false, "Before move-in");
  }

  const next = dedupeCharges([...rows, ...created]);
  const changed =
    next.length !== before.length ||
    JSON.stringify(next.map((charge) => charge.id).sort()) !== JSON.stringify(before.map((charge) => charge.id).sort());
  if (changed) writeAll(next);
  return changed;
}

export function removeApprovedApplicationCharges(applicationId: string, managerUserId: string | null): boolean {
  if (!isBrowser()) return false;
  const appId = applicationId.trim();
  if (!appId) return false;
  const scope = managerUserId ?? HOUSEHOLD_CHARGE_DEMO_MANAGER_SCOPE;
  const rows = readAll();
  const next = rows.filter(
    (charge) => !(charge.applicationId === appId && charge.managerUserId === scope && charge.kind !== "application_fee"),
  );
  if (next.length === rows.length) return false;
  writeAll(next);
  return true;
}

export function removeAllApplicationCharges(applicationId: string, managerUserId: string | null): boolean {
  if (!isBrowser()) return false;
  const appId = applicationId.trim();
  if (!appId) return false;
  const scope = managerUserId ?? HOUSEHOLD_CHARGE_DEMO_MANAGER_SCOPE;
  const rows = readAll();
  const next = rows.filter((charge) => !(charge.applicationId === appId && charge.managerUserId === scope));
  if (next.length === rows.length) return false;
  writeAll(next);
  return true;
}

/**
 * Legacy helper kept for compatibility with older flows. New approval code calls
 * recordApprovedApplicationCharges instead.
 */
export function recordLegacyApplicationSigningCharges(
  input: {
    residentEmail: string;
    residentName: string;
    residentUserId: string | null;
    propertyId: string;
  },
  opts?: { skipApplicationFee?: boolean }
): void {
  const existingAppFee = findApplicationFeeCharge(
    input.residentEmail,
    input.propertyId,
    input.residentUserId
  );

  const prop = getPropertyById(input.propertyId);
  const sub = prop?.listingSubmission;
  if (!sub) return;
  const zelleSnap =
    sub.zellePaymentsEnabled && sub.zelleContact?.trim() ? sub.zelleContact.trim() : undefined;
  const created: HouseholdCharge[] = [];
  const idBase = `hc_${Date.now()}`;

  const pushLine = (kind: HouseholdChargeKind, blocksLease: boolean) => {
    if (kind === "application_fee") {
      if (opts?.skipApplicationFee) return;
      if (existingAppFee) return;
    }
    const raw = submissionAmount(sub, kind);
    const amt = parseMoneyAmount(raw);
    if (amt <= 0) return;
    const label = raw.trim() || `$${amt.toFixed(2)}`;
    created.push({
      id: `${idBase}_${kind}`,
      createdAt: new Date().toISOString(),
      residentEmail: input.residentEmail.trim(),
      residentName: input.residentName.trim(),
      residentUserId: input.residentUserId,
      propertyId: input.propertyId,
      propertyLabel: prop?.title ?? sub.buildingName,
      managerUserId: prop?.managerUserId ?? null,
      kind,
      title: chargeTitle(kind),
      amountLabel: label,
      balanceLabel: label.includes("$") ? label : `$${amt.toFixed(2)}`,
      status: "pending",
      zelleContactSnapshot: zelleSnap,
      blocksLeaseUntilPaid: blocksLease,
    });
  };

  pushLine("application_fee", false);
  pushLine("security_deposit", true);
  pushLine("move_in_fee", false);
  pushLine("payment_at_signing", true);

  if (created.length === 0) return;
  writeAll([...readAll(), ...created]);
}

/**
 * Manager-editable override of a charge's amount and title.
 * Only updates if the charge belongs to this manager and is still pending.
 */
export function updateHouseholdChargeAmount(
  chargeId: string,
  newAmount: number,
  managerUserId: string | null,
  newTitle?: string,
): boolean {
  if (!isBrowser() || !Number.isFinite(newAmount) || newAmount < 0) return false;
  const scope = managerUserId ?? HOUSEHOLD_CHARGE_DEMO_MANAGER_SCOPE;
  const rows = readAll();
  const i = rows.findIndex((r) => r.id === chargeId && r.managerUserId === scope);
  if (i === -1) return false;
  const label = `$${newAmount.toFixed(2)}`;
  const next = [...rows];
  next[i] = {
    ...next[i]!,
    amountLabel: label,
    balanceLabel: next[i]!.status === "paid" ? "$0.00" : label,
    ...(newTitle?.trim() ? { title: newTitle.trim() } : {}),
  };
  writeAll(next);
  return true;
}

/**
 * Computes the upgrade charges when a resident converts from short-term to long-term.
 * Returns a breakdown of what is owed — callers display this; use recordShortToLongTermConversionCharges to persist.
 */
export function shortToLongTermUpgradeBreakdown(
  propertyId: string,
  isMonthToMonth: boolean,
): {
  applicationFee: { amount: number; waived: boolean; label: string };
  moveInFee: { amount: number; delta: number; label: string };
  securityDeposit: { amount: number; delta: number; label: string };
  monthToMonthSurcharge: { amount: number; label: string };
  totalDue: number;
} | null {
  const prop = getPropertyById(propertyId);
  const sub = prop?.listingSubmission?.v === 1 ? normalizeManagerListingSubmissionV1(prop.listingSubmission) : null;
  if (!sub) return null;

  const appFeeAmount = parseMoneyAmount(sub.applicationFee);
  const longTermDeposit = parseMoneyAmount(sub.securityDeposit);
  const longTermMoveIn = parseMoneyAmount(sub.moveInFee);
  const shortTermDeposit = parseMoneyAmount(sub.shortTermDeposit ?? "");
  const shortTermMoveIn = parseMoneyAmount(sub.shortTermMoveInFee ?? "");
  const mtmSurcharge = parseMoneyAmount(sub.monthToMonthSurcharge ?? "");

  const depositDelta = Math.max(0, longTermDeposit - shortTermDeposit);
  const moveInDelta = Math.max(0, longTermMoveIn - shortTermMoveIn);
  const mtm = isMonthToMonth ? mtmSurcharge : 0;

  const totalDue = depositDelta + moveInDelta + mtm;

  return {
    applicationFee: { amount: appFeeAmount, waived: true, label: appFeeAmount > 0 ? `$${appFeeAmount.toFixed(2)} (waived — already paid)` : "Waived" },
    moveInFee: { amount: longTermMoveIn, delta: moveInDelta, label: moveInDelta > 0 ? `$${moveInDelta.toFixed(2)} balance` : "Fully paid" },
    securityDeposit: { amount: longTermDeposit, delta: depositDelta, label: depositDelta > 0 ? `$${depositDelta.toFixed(2)} balance` : "Fully paid" },
    monthToMonthSurcharge: { amount: mtm, label: mtm > 0 ? `$${mtm.toFixed(2)}/mo added to rent` : "" },
    totalDue,
  };
}

/**
 * Creates the delta charges when a resident upgrades from short-term to long-term.
 * Marks application fee as waived. Only creates new delta lines — idempotent per applicationId.
 */
export function recordShortToLongTermConversionCharges(
  row: DemoApplicantRow,
  managerUserId: string | null,
  isMonthToMonth: boolean,
): boolean {
  if (!isBrowser()) return false;
  const residentEmail = row.email?.trim();
  if (!residentEmail || !residentEmail.includes("@")) return false;
  const applicationId = row.id.trim();
  if (!applicationId) return false;
  const propertyId = row.assignedPropertyId?.trim() || row.propertyId?.trim() || row.application?.propertyId?.trim() || "";
  if (!propertyId) return false;

  const prop = getPropertyById(propertyId);
  const sub = prop?.listingSubmission?.v === 1 ? normalizeManagerListingSubmissionV1(prop.listingSubmission) : null;
  if (!sub) return false;

  const propertyLabel = prop?.title ?? row.property ?? "Listing";
  const zelleSnap = sub.zellePaymentsEnabled && sub.zelleContact?.trim() ? sub.zelleContact.trim() : undefined;
  const effectiveManagerUserId = managerUserId ?? row.managerUserId ?? prop?.managerUserId ?? null;
  const residentName = row.name?.trim() || row.application?.fullLegalName?.trim() || "Resident";

  const breakdown = shortToLongTermUpgradeBreakdown(propertyId, isMonthToMonth);
  if (!breakdown) return false;

  const rows = readAll();
  const created: HouseholdCharge[] = [];

  // Mark application fee paid/waived
  const appFeeId = applicationFeeChargeIdForApplication(applicationId);
  const appFeeIdx = rows.findIndex((r) => r.id === appFeeId || (r.kind === "application_fee" && r.applicationId === applicationId));
  if (appFeeIdx !== -1 && rows[appFeeIdx]!.status !== "paid") {
    rows[appFeeIdx] = { ...rows[appFeeIdx]!, status: "paid", paidAt: new Date().toISOString(), balanceLabel: "$0.00", title: "Application fee (waived — already paid short-term)" };
  }

  const makeId = (suffix: string) => `hc_upgrade_${chargeKeyPart(applicationId)}_${suffix}`;

  if (breakdown.moveInFee.delta > 0 && !rows.some((r) => r.id === makeId("movein"))) {
    const label = `$${breakdown.moveInFee.delta.toFixed(2)}`;
    created.push({
      id: makeId("movein"),
      createdAt: new Date().toISOString(),
      applicationId,
      residentEmail,
      residentName,
      residentUserId: null,
      propertyId,
      propertyLabel,
      managerUserId: effectiveManagerUserId,
      kind: "move_in_fee",
      title: `Move-in fee balance (upgrade to long-term)`,
      amountLabel: label,
      balanceLabel: label,
      status: "pending",
      zelleContactSnapshot: zelleSnap,
      blocksLeaseUntilPaid: true,
      dueDateLabel: "Before new lease signing",
    });
  }

  if (breakdown.securityDeposit.delta > 0 && !rows.some((r) => r.id === makeId("deposit"))) {
    const label = `$${breakdown.securityDeposit.delta.toFixed(2)}`;
    created.push({
      id: makeId("deposit"),
      createdAt: new Date().toISOString(),
      applicationId,
      residentEmail,
      residentName,
      residentUserId: null,
      propertyId,
      propertyLabel,
      managerUserId: effectiveManagerUserId,
      kind: "security_deposit",
      title: `Security deposit balance (upgrade to long-term)`,
      amountLabel: label,
      balanceLabel: label,
      status: "pending",
      zelleContactSnapshot: zelleSnap,
      blocksLeaseUntilPaid: true,
      dueDateLabel: "Before new lease signing",
    });
  }

  if (created.length === 0 && appFeeIdx === -1) return false;
  writeAll([...rows, ...created]);
  return true;
}

/** Reserved for seeding sample charges; does not inject data. */
export function seedDemoHouseholdChargesIfEmpty(_managerUserId: string): void {
  void _managerUserId;
  /* no-op */
}

/** Manager-created charge (fine, fee, custom) against a specific resident. */
export function createManagerCharge(input: {
  residentEmail: string;
  residentName: string;
  propertyId: string;
  propertyLabel: string;
  managerUserId: string | null;
  title: string;
  amount: number;
  blocksLeaseUntilPaid?: boolean;
}): HouseholdCharge | null {
  const email = input.residentEmail.trim();
  if (!email || !Number.isFinite(input.amount) || input.amount <= 0) return null;
  const balance = `$${input.amount.toFixed(2)}`;
  const charge: HouseholdCharge = {
    id: `hc_mgr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    residentEmail: email,
    residentName: input.residentName.trim() || "Resident",
    residentUserId: null,
    propertyId: input.propertyId,
    propertyLabel: input.propertyLabel,
    managerUserId: input.managerUserId,
    kind: "work_order_charge",
    title: input.title.trim() || "Manager charge",
    amountLabel: balance,
    balanceLabel: balance,
    status: "pending",
    blocksLeaseUntilPaid: input.blocksLeaseUntilPaid ?? false,
  };
  writeAll([...readAll(), charge]);
  return charge;
}

/**
 * Creates recurring rent profiles for approved residents who don't already have one.
 * Writes + emits only if at least one profile is new; otherwise returns false without side effects.
 * Safe to call on every render cycle — acts as a no-op once all profiles exist.
 */
export function autoSeedRecurringRentProfiles(
  residents: Array<{
    email: string;
    name: string;
    propertyId: string;
    propertyLabel: string | undefined;
    roomLabel: string | undefined;
    managerUserId: string | null;
    monthlyRent: number;
    dueDay?: number;
  }>,
): boolean {
  if (!isBrowser() || residents.length === 0) return false;
  const existing = readRentProfiles();
  const existingKeys = new Set(
    existing.filter((p) => p.active).map((p) => `${p.residentEmail.trim().toLowerCase()}|${p.propertyId}`),
  );

  const toAdd: RecurringRentProfile[] = [];
  for (const r of residents) {
    const email = r.email.trim().toLowerCase();
    if (!email || !Number.isFinite(r.monthlyRent) || r.monthlyRent <= 0) continue;
    const key = `${email}|${r.propertyId}`;
    if (existingKeys.has(key)) continue;
    toAdd.push({
      id: `rent_profile_${crypto.randomUUID()}`,
      residentEmail: r.email.trim(),
      residentName: r.name.trim() || "Resident",
      residentUserId: null,
      propertyId: r.propertyId,
      propertyLabel: (r.propertyLabel ?? "").trim() || "Property",
      roomLabel: (r.roomLabel ?? "").trim() || "Room",
      managerUserId: r.managerUserId,
      monthlyRent: Number(r.monthlyRent.toFixed(2)),
      dueDay: Math.min(28, Math.max(1, Math.round(r.dueDay ?? 1))),
      startMonth: currentRentMonth(),
      active: true,
      updatedAt: new Date().toISOString(),
    });
  }

  if (toAdd.length === 0) return false;
  writeRentProfiles([...existing, ...toAdd]);
  return true;
}

export function residentLeaseBlockedReasons(email: string, userId: string | null): string[] {
  void email;
  void userId;
  return [];
}

export function householdChargeToLedgerRow(c: HouseholdCharge): DemoManagerPaymentLedgerRow {
  const bucket: ManagerPaymentBucket = c.status === "paid" ? "paid" : "pending";
  return {
    id: c.id,
    householdChargeId: c.id,
    propertyName: c.propertyLabel,
    roomNumber: "—",
    residentName: c.residentName,
    chargeTitle: c.title,
    lineAmount: c.amountLabel,
    amountPaid: c.status === "paid" ? c.amountLabel : "$0.00",
    balanceDue: c.status === "paid" ? "$0.00" : c.balanceLabel,
    dueDate: chargeDueLabel(c),
    bucket,
    statusLabel: c.status === "paid" ? "Paid" : "Pending",
    notes:
      c.kind === "rent"
        ? `Recurring tenant rent. Current cycle: ${c.rentMonth ?? currentRentMonth()}. Due ${formatRecurringRentDueLabel(c.rentMonth ?? currentRentMonth(), c.dueDay ?? 1)}.`
        : c.kind === "application_fee"
        ? c.status === "paid"
          ? "Application fee recorded as paid."
          : "Application fee pending — mark as paid after you receive the manual payment."
        : c.kind === "work_order_charge"
          ? "Work order pass-through — resident is billed this amount; mark as paid when you receive payment."
          : c.zelleContactSnapshot
            ? `Zelle contact on listing: ${c.zelleContactSnapshot}`
            : c.venmoContactSnapshot
              ? `Venmo contact on listing: ${c.venmoContactSnapshot}`
            : "Awaiting payment.",
  };
}

/**
 * Removes stale legacy application-fee rows that no longer map to a current application.
 * Current application fees are rebuilt as one canonical row per application by the Payments page.
 */
export function pruneObsoleteManagerCharges(
  managerUserId: string | null,
  applicationRows: DemoApplicantRow[],
): boolean {
  if (!isBrowser()) return false;
  const scope = managerUserId ?? HOUSEHOLD_CHARGE_DEMO_MANAGER_SCOPE;
  const rows = readAll();
  const activeApplicationIds = new Set(applicationRows.map((row) => row.id.trim()).filter(Boolean));
  const activeFallbackKeys = new Set(
    applicationRows.map((row) => {
      const email = row.email?.trim().toLowerCase() || "";
      const propertyId = row.assignedPropertyId?.trim() || row.propertyId?.trim() || row.application?.propertyId?.trim() || "";
      return email && propertyId ? `${email}|${propertyId}` : "";
    }).filter(Boolean),
  );
  const obsolete = rows.filter((charge) => {
    if (charge.managerUserId !== scope || charge.kind !== "application_fee") return false;
    if (charge.applicationId?.trim()) return !activeApplicationIds.has(charge.applicationId.trim());
    const fallbackKey = `${charge.residentEmail.trim().toLowerCase()}|${charge.propertyId}`;
    return !activeFallbackKeys.has(fallbackKey);
  });
  if (obsolete.length === 0) return false;
  for (const charge of obsolete) {
    deleteChargeRowFromServer(charge.id);
  }
  writeAll(
    rows.filter((charge) => !(charge.managerUserId === scope && charge.kind === "application_fee" && charge.status === "paid")),
  );
  return true;
}
