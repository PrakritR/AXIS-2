/**
 * Demo: per-resident charge lines (application fee, security deposit, etc.) tied to listings.
 * Managers mark Zelle/offline payments as paid; lease signing can be gated until required lines are paid.
 */

import { getPropertyById } from "@/lib/rental-application/data";
import type { ManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";
import type { DemoManagerPaymentLedgerRow, ManagerPaymentBucket } from "@/data/demo-portal";

export const HOUSEHOLD_CHARGES_EVENT = "axis:household-charges";

/** Promo code entered on the rental application (step 12) to waive the listing application fee (demo). */
export const APPLICATION_FEE_PROMO_WAIVE_CODE = "FEEWAIVE";

const STORAGE_KEY = "axis_household_charges_v1";

/** When no manager Supabase session, work-order pass-through charges use this scope so Payments still lists them (demo). */
export const HOUSEHOLD_CHARGE_DEMO_MANAGER_SCOPE = "__axis_demo_manager_scope__";

export type HouseholdChargeKind =
  | "application_fee"
  | "security_deposit"
  | "move_in_fee"
  | "payment_at_signing"
  | "work_order_charge";

export type HouseholdCharge = {
  id: string;
  createdAt: string;
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
};

function isBrowser() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function emit() {
  if (!isBrowser()) return;
  window.dispatchEvent(new Event(HOUSEHOLD_CHARGES_EVENT));
}

function readAll(): HouseholdCharge[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? (v as HouseholdCharge[]) : [];
  } catch {
    return [];
  }
}

function writeAll(rows: HouseholdCharge[]) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
    emit();
  } catch {
    /* ignore */
  }
}

export function parseMoneyAmount(label: string): number {
  const n = Number.parseFloat(String(label).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function chargeTitle(kind: HouseholdChargeKind): string {
  switch (kind) {
    case "application_fee":
      return "Application fee";
    case "security_deposit":
      return "Security deposit";
    case "move_in_fee":
      return "Move-in fee";
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
    case "security_deposit":
      return sub.securityDeposit;
    case "move_in_fee":
      return sub.moveInFee;
    case "payment_at_signing":
      return sub.paymentAtSigning;
    case "work_order_charge":
      return "$0";
    default:
      return "$0";
  }
}

export function findPendingWorkOrderCharge(workOrderId: string): HouseholdCharge | undefined {
  return readAll().find((c) => c.workOrderId === workOrderId && c.kind === "work_order_charge" && c.status === "pending");
}

export function findApplicationFeeCharge(
  residentEmail: string,
  propertyId: string,
  residentUserId?: string | null
): HouseholdCharge | undefined {
  const e = residentEmail.trim().toLowerCase();
  return readAll().find((r) => {
    if (r.kind !== "application_fee" || r.propertyId !== propertyId) return false;
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
 * (e.g. Zelle) and the manager can mark it paid before the wizard finalizes and shows an Application ID.
 */
export function ensurePendingApplicationFeeCharge(input: {
  residentEmail: string;
  residentName: string;
  residentUserId: string | null;
  propertyId: string;
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

  const existing = findApplicationFeeCharge(email, input.propertyId, input.residentUserId);
  if (existing) return existing;

  const zelleSnap =
    sub && sub.zellePaymentsEnabled && sub.zelleContact?.trim() ? sub.zelleContact.trim() : undefined;

  const idBase = `hc_${Date.now()}`;
  const label = raw.trim() || `$${amt.toFixed(2)}`;
  const charge: HouseholdCharge = {
    id: `${idBase}_application_fee`,
    createdAt: new Date().toISOString(),
    residentEmail: email,
    residentName: input.residentName.trim() || "Applicant",
    residentUserId: input.residentUserId,
    propertyId: input.propertyId,
    propertyLabel: prop?.title ?? (sub ? sub.buildingName : "Listing"),
    managerUserId: prop?.managerUserId ?? null,
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
 * Called when an applicant completes the rental wizard (step 12).
 * Creates pending lines from the listing’s fee fields.
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
    input.residentUserId
  );

  const prop = getPropertyById(input.propertyId);
  const sub = prop?.listingSubmission;
  if (!sub) {
    if (opts?.skipApplicationFee || existingAppFee) return;
    /* still record a generic application fee line using defaults */
    const idBase = `hc_${Date.now()}`;
    const fallback: HouseholdCharge = {
      id: `${idBase}_app`,
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
    dueDate: new Date(c.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
    bucket,
    statusLabel: c.status === "paid" ? "Paid" : "Pending",
    notes:
      c.kind === "application_fee"
        ? "Application fee — open Details and tap Mark as paid when you receive Zelle or another payment."
        : c.kind === "work_order_charge"
          ? "Work order pass-through — resident is billed this amount; mark as paid when you receive Zelle or other payment."
          : c.zelleContactSnapshot
            ? `Zelle contact on listing: ${c.zelleContactSnapshot}`
            : "Awaiting payment.",
  };
}
