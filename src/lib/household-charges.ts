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

function isBrowser() {
  return typeof window !== "undefined";
}

function emit() {
  if (!isBrowser()) return;
  window.dispatchEvent(new Event(HOUSEHOLD_CHARGES_EVENT));
}

function postHouseholdPayload(body: unknown) {
  if (typeof window === "undefined") return;
  void fetch("/api/portal-household-charges", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  }).catch(() => undefined);
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
  try {
    const res = await fetch("/api/portal-household-charges", { credentials: "include", cache: "no-store" });
    if (!res.ok) {
      return { charges: readAll(), rentProfiles: readRentProfiles() };
    }
    const body = (await res.json()) as {
      charges?: HouseholdCharge[];
      rentProfiles?: RecurringRentProfile[];
    };
    const charges = Array.isArray(body.charges) ? body.charges : [];
    const rentProfiles = Array.isArray(body.rentProfiles) ? body.rentProfiles : [];
    memoryCharges = charges;
    memoryRentProfiles = rentProfiles;
    syncAllRecurringRentCharges();
    emit();
    return { charges, rentProfiles };
  } catch {
    return { charges: readAll(), rentProfiles: readRentProfiles() };
  }
}

function readAll(): HouseholdCharge[] {
  return isBrowser() ? memoryCharges : [];
}

function writeAll(rows: HouseholdCharge[], silent = false) {
  if (!isBrowser()) return;
  memoryCharges = rows;
  mirrorChargeRows(rows);
  if (!silent) emit();
}

function readRentProfiles(): RecurringRentProfile[] {
  return isBrowser() ? memoryRentProfiles : [];
}

function writeRentProfiles(rows: RecurringRentProfile[]) {
  if (!isBrowser()) return;
  memoryRentProfiles = rows;
  mirrorRentProfiles(rows);
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

function recurringRentChargeId(profileId: string, month: string) {
  return `hc_rent_${profileId}_${month}`;
}

function formatRecurringRentDueLabel(month: string, dueDay: number) {
  const [year, monthIndex] = month.split("-").map(Number);
  const dt = new Date(year!, (monthIndex ?? 1) - 1, dueDay, 12, 0, 0, 0);
  return Number.isNaN(dt.getTime())
    ? `${month}-${String(dueDay).padStart(2, "0")}`
    : dt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function dueLabelForLeaseStart(leaseStart?: string | null): string {
  const raw = leaseStart?.trim();
  if (!raw) return "Before move-in";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "Before move-in";
  return `Before ${date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
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
    case "payment_at_signing":
      return paymentAtSigningPriceLabel(sub);
    case "work_order_charge":
      return "$0";
    default:
      return "$0";
  }
}

function normalizeMoneyLabel(raw: string, amount: number): string {
  const t = raw.trim();
  if (t) return t.startsWith("$") ? t : `$${amount.toFixed(2)}`;
  return `$${amount.toFixed(2)}`;
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

function selectedRoomUtilities(row: Pick<DemoApplicantRow, "assignedRoomChoice" | "application" | "propertyId" | "assignedPropertyId">): {
  raw: string;
  amount: number;
} {
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
 * (e.g. Zelle) and the manager can mark it paid before the wizard finalizes and shows an Axis ID.
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
  if (!isBrowser()) return false;
  const profiles = readRentProfiles().filter((profile) => profile.active);
  if (profiles.length === 0) return false;

  const month = currentRentMonth();
  const rows = readAll();
  const next = [...rows];
  let changed = false;

  for (const profile of profiles) {
    if (month < profile.startMonth) continue;

    const chargeId = recurringRentChargeId(profile.id, month);
    const idx = next.findIndex((row) => row.id === chargeId);
    const amountLabel = `$${profile.monthlyRent.toFixed(2)}`;
    const baseCharge: HouseholdCharge = {
      id: chargeId,
      createdAt: new Date().toISOString(),
      residentEmail: profile.residentEmail,
      residentName: profile.residentName,
      residentUserId: profile.residentUserId,
      propertyId: profile.propertyId,
      propertyLabel: profile.propertyLabel,
      managerUserId: profile.managerUserId,
      kind: "rent",
      title: `Rent · ${month}`,
      amountLabel,
      balanceLabel: amountLabel,
      status: "pending",
      blocksLeaseUntilPaid: false,
      recurringRentProfileId: profile.id,
      rentMonth: month,
      dueDay: profile.dueDay,
    };

    if (idx === -1) {
      next.push(baseCharge);
      changed = true;
      continue;
    }

    const existing = next[idx]!;
    const updated: HouseholdCharge = {
      ...existing,
      ...baseCharge,
      createdAt: existing.createdAt,
      status: existing.status,
      paidAt: existing.paidAt,
      balanceLabel: existing.status === "paid" ? "$0.00" : amountLabel,
    };

    if (
      existing.residentEmail !== updated.residentEmail ||
      existing.residentName !== updated.residentName ||
      existing.residentUserId !== updated.residentUserId ||
      existing.propertyId !== updated.propertyId ||
      existing.propertyLabel !== updated.propertyLabel ||
      existing.managerUserId !== updated.managerUserId ||
      existing.title !== updated.title ||
      existing.amountLabel !== updated.amountLabel ||
      existing.balanceLabel !== updated.balanceLabel ||
      existing.rentMonth !== updated.rentMonth ||
      existing.dueDay !== updated.dueDay
    ) {
      next[idx] = updated;
      changed = true;
    }
  }

  if (changed) writeAll(next, true);
  return changed;
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
  const email = input.residentEmail.trim().toLowerCase();
  if (!email || !Number.isFinite(input.monthlyRent) || input.monthlyRent <= 0) return null;
  const rows = readRentProfiles();
  const idx = rows.findIndex(
    (profile) => profile.residentEmail.trim().toLowerCase() === email && profile.propertyId === input.propertyId,
  );
  const profile: RecurringRentProfile = {
    id: idx === -1 ? `rent_profile_${crypto.randomUUID()}` : rows[idx]!.id,
    residentEmail: input.residentEmail.trim(),
    residentName: input.residentName.trim() || "Resident",
    residentUserId: input.residentUserId ?? null,
    propertyId: input.propertyId,
    propertyLabel: input.propertyLabel.trim() || "Property",
    roomLabel: input.roomLabel.trim() || "Room",
    managerUserId: input.managerUserId,
    monthlyRent: Number(input.monthlyRent.toFixed(2)),
    dueDay: Math.min(28, Math.max(1, Math.round(input.dueDay ?? 1))),
    startMonth: input.startMonth?.trim() || currentRentMonth(),
    active: true,
    updatedAt: new Date().toISOString(),
  };
  const next = [...rows];
  if (idx === -1) next.push(profile);
  else next[idx] = profile;
  writeRentProfiles(next);
  return profile;
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
  return readAll().filter((r) => {
    if (userId && r.residentUserId === userId) return true;
    return r.residentEmail.trim().toLowerCase() === e;
  });
}

export function readChargesForManager(managerUserId: string | null): HouseholdCharge[] {
  const scope = managerUserId ?? HOUSEHOLD_CHARGE_DEMO_MANAGER_SCOPE;
  return readAll().filter((r) => r.managerUserId === scope);
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
      managerUserId: prop?.managerUserId ?? null,
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
  const applicationId = row.id.trim();
  if (!applicationId) return false;
  const propertyId = row.assignedPropertyId?.trim() || row.propertyId?.trim() || row.application?.propertyId?.trim() || "";
  if (!propertyId) return false;
  const appFeeChannel = row.application?.applicationFeePayChannel === "zelle" ? "zelle" : "stripe";
  const prop = getPropertyById(propertyId);
  const effectiveManagerUserId = managerUserId ?? row.managerUserId ?? prop?.managerUserId ?? null;
  const residentName = row.name?.trim() || row.application?.fullLegalName?.trim() || "Applicant";
  const expected = ensurePendingApplicationFeeCharge({
    residentEmail,
    residentName,
    residentUserId: null,
    propertyId,
    applicationId,
    managerUserId: effectiveManagerUserId,
  });
  if (!expected) return false;

  const canonicalId = applicationFeeChargeIdForApplication(applicationId);
  const rows = readAll();
  const matching = rows.filter((charge) => {
    if (charge.kind !== "application_fee") return false;
    if (charge.applicationId === applicationId) return true;
    return !charge.applicationId && charge.propertyId === propertyId && charge.residentEmail.trim().toLowerCase() === residentEmail.trim().toLowerCase();
  });
  const paidMatch = matching.find((charge) => charge.status === "paid");
  const seed = matching.find((charge) => charge.id === canonicalId) ?? matching[0] ?? expected;
  const shouldBePaid = appFeeChannel !== "zelle" || Boolean(paidMatch);
  const canonicalCharge: HouseholdCharge = {
    ...seed,
    id: canonicalId,
    applicationId,
    residentEmail,
    residentName,
    residentUserId: seed.residentUserId ?? null,
    propertyId,
    propertyLabel: prop?.title ?? seed.propertyLabel,
    managerUserId: effectiveManagerUserId,
    kind: "application_fee",
    title: chargeTitle("application_fee"),
    amountLabel: expected.amountLabel,
    balanceLabel: shouldBePaid ? "$0.00" : expected.balanceLabel,
    status: shouldBePaid ? "paid" : "pending",
    paidAt: shouldBePaid ? (paidMatch?.paidAt ?? seed.paidAt ?? new Date().toISOString()) : undefined,
    zelleContactSnapshot: expected.zelleContactSnapshot,
    blocksLeaseUntilPaid: false,
  };

  const next = rows.filter((charge) => !matching.some((match) => match.id === charge.id));
  next.push(canonicalCharge);

  const unchanged =
    matching.length === 1 &&
    matching[0]!.id === canonicalCharge.id &&
    JSON.stringify(matching[0]) === JSON.stringify(canonicalCharge);
  if (unchanged) return false;

  writeAll(next);
  return true;
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
  const propertyLabel = prop?.title ?? row.property ?? "Listing";
  const zelleSnap = sub?.zellePaymentsEnabled && sub.zelleContact?.trim() ? sub.zelleContact.trim() : undefined;
  const effectiveManagerUserId = managerUserId ?? row.managerUserId ?? prop?.managerUserId ?? null;
  const residentName = row.name?.trim() || row.application?.fullLegalName?.trim() || "Resident";
  const roomLabel = row.assignedRoomChoice?.trim() || row.application?.roomChoice1?.trim() || "Room";
  let changed = false;
  let firstChargeMonth = row.application?.leaseStart?.trim().slice(0, 7) || currentRentMonth();
  const leaseStart = row.application?.leaseStart?.trim();
  const moveInDue = dueLabelForLeaseStart(leaseStart);

  changed = recordSubmittedApplicationFeeCharge(row, effectiveManagerUserId) || changed;

  const residentEmailKey = residentEmail.trim().toLowerCase();
  const managedKinds = new Set<HouseholdChargeKind>([
    "first_month_rent",
    "prorated_rent",
    "utilities",
    "prorated_utilities",
    "security_deposit",
    "move_in_fee",
  ]);
  const rows = readAll();
  const existingManaged = rows.filter((charge) => {
    if (!managedKinds.has(charge.kind)) return false;
    if (charge.applicationId === applicationId) return true;
    return !charge.applicationId && charge.propertyId === propertyId && charge.residentEmail.trim().toLowerCase() === residentEmailKey;
  });
  const created: HouseholdCharge[] = [];
  const pushCharge = (
    kind: HouseholdChargeKind,
    raw: string,
    blocksLeaseUntilPaid: boolean,
    titleOverride?: string,
    dueDateLabel?: string,
  ) => {
    const amount = parseMoneyAmount(raw);
    if (amount <= 0) return;
    const label = normalizeMoneyLabel(raw, amount);
    const existingOfKind = existingManaged.filter((charge) => charge.kind === kind);
    const paidExisting = existingOfKind.find((charge) => charge.status === "paid");
    const seed = existingOfKind.find((charge) => charge.id === approvedChargeId(applicationId, kind)) ?? existingOfKind[0];
    created.push({
      id: approvedChargeId(applicationId, kind),
      createdAt: seed?.createdAt ?? new Date().toISOString(),
      applicationId,
      residentEmail,
      residentName,
      residentUserId: seed?.residentUserId ?? null,
      propertyId,
      propertyLabel,
      managerUserId: effectiveManagerUserId,
      kind,
      title: titleOverride ?? chargeTitle(kind),
      amountLabel: label,
      balanceLabel: paidExisting ? "$0.00" : label,
      status: paidExisting ? "paid" : "pending",
      paidAt: paidExisting?.paidAt,
      zelleContactSnapshot: zelleSnap ?? seed?.zelleContactSnapshot,
      blocksLeaseUntilPaid,
      dueDateLabel,
    });
  };

  const recurringStartMonth = (leaseStart?: string): string => {
    const [yearRaw, monthRaw] = leaseStart?.split("-") ?? [];
    const year = Number(yearRaw);
    const month = Number(monthRaw);
    const base = Number.isFinite(year) && Number.isFinite(month) && year > 0 && month > 0
      ? new Date(year, month - 1, 1, 12, 0, 0, 0)
      : new Date();
    base.setMonth(base.getMonth() + 1);
    return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}`;
  };

  const signedRent = selectedRoomRentAmount(row);
  if (signedRent > 0) {
    firstChargeMonth = leaseStart?.slice(0, 7) || firstChargeMonth;
    const start = leaseStartProration(leaseStart);
    const firstRentKind: HouseholdChargeKind = start.prorated ? "prorated_rent" : "first_month_rent";
    const firstRentAmount = start.prorated ? signedRent * start.factor : signedRent;
    pushCharge(
      firstRentKind,
      moneyAmountLabel(firstRentAmount),
      false,
      start.prorated ? "Prorated first month's rent" : "First month's rent",
      moveInDue,
    );
    const profile = upsertRecurringRentProfile({
      residentEmail,
      residentName,
      residentUserId: null,
      propertyId,
      propertyLabel,
      roomLabel,
      managerUserId: effectiveManagerUserId,
      monthlyRent: signedRent,
      startMonth: recurringStartMonth(leaseStart),
    });
    if (profile) changed = true;
  }

  if (sub) {
    pushCharge("security_deposit", sub.securityDeposit, true, undefined, "Before lease signing");
    pushCharge("move_in_fee", sub.moveInFee, true, undefined, "Before lease signing");
    const utilities = selectedRoomUtilities(row);
    if (utilities.amount > 0) {
      const start = leaseStartProration(leaseStart);
      const utilityKind: HouseholdChargeKind = start.prorated ? "prorated_utilities" : "utilities";
      const utilityAmount = start.prorated ? utilities.amount * start.factor : utilities.amount;
      pushCharge(
        utilityKind,
        moneyAmountLabel(utilityAmount),
        false,
        start.prorated ? "Prorated utilities" : "Utilities",
        moveInDue,
      );
    }
  }

  const createsExplicitFirstRent = created.some((charge) => charge.kind === "first_month_rent" || charge.kind === "prorated_rent");
  let next = rows.filter((charge) => !existingManaged.some((managed) => managed.id === charge.id));
  if (createsExplicitFirstRent) {
    next = next.filter(
      (charge) =>
        !(
          charge.kind === "rent" &&
          charge.status === "pending" &&
          charge.propertyId === propertyId &&
          charge.residentEmail.trim().toLowerCase() === residentEmail.trim().toLowerCase() &&
          charge.rentMonth === firstChargeMonth
        ),
    );
  }
  next.push(...created);
  const existingSignature = JSON.stringify([...existingManaged].sort((a, b) => a.id.localeCompare(b.id)));
  const nextSignature = JSON.stringify([...created].sort((a, b) => a.id.localeCompare(b.id)));
  if (existingSignature !== nextSignature || next.length !== rows.length) {
    writeAll(next);
    changed = true;
  }

  return changed;
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
  const charges = readChargesForResident(email, userId);
  const out: string[] = [];
  for (const c of charges) {
    if (c.status === "pending" && c.blocksLeaseUntilPaid) {
      out.push(`${c.title} (${c.balanceLabel})`);
    }
  }
  return out;
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
          : "Application fee pending — mark as paid after you receive the Zelle payment."
        : c.kind === "work_order_charge"
          ? "Work order pass-through — resident is billed this amount; mark as paid when you receive Zelle or other payment."
          : c.zelleContactSnapshot
            ? `Zelle contact on listing: ${c.zelleContactSnapshot}`
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
