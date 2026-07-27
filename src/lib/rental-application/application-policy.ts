import type { DemoApplicantRow } from "@/data/demo-portal";
import {
  readChargesForResident,
  findApplicationFeeCharge,
  findHoldingDepositCharge,
  listingApplicationFeeAmount,
  listingHoldingDepositAmount,
} from "@/lib/household-charges";
import { readManagerApplicationRows } from "@/lib/manager-applications-storage";
import type { ManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";
import { getPropertyById } from "@/lib/rental-application/data";
import { isInProgressApplicationRow } from "@/lib/rental-application/in-progress-application";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function applicationsForResidentEmail(email: string): DemoApplicantRow[] {
  const e = normalizeEmail(email);
  if (!e) return [];
  return readManagerApplicationRows().filter((row) => normalizeEmail(row.email ?? "") === e);
}

export function listingAllowsMultipleApplications(propertyId: string): boolean {
  const sub = getPropertyById(propertyId)?.listingSubmission;
  return sub?.allowMultiplePropertyApplications === true;
}

export function listingApplicationFeeOnlyFirstApplication(propertyId: string): boolean {
  const sub = getPropertyById(propertyId)?.listingSubmission;
  return sub?.applicationFeeOnlyFirstApplication === true;
}

/** Resident already has a submitted application (any property) before this new one. */
export function residentHasPriorApplication(email: string): boolean {
  return applicationsForResidentEmail(email).some((row) => !isInProgressApplicationRow(row));
}

/** Resident has a paid application-fee charge on any property. */
export function residentHasPaidApplicationFee(email: string, residentUserId?: string | null): boolean {
  const e = normalizeEmail(email);
  if (!e) return false;
  return readChargesForResident(e, residentUserId ?? null).some(
    (c) => c.kind === "application_fee" && c.status === "paid",
  );
}

export function shouldWaiveApplicationFeeForResident(input: {
  propertyId: string;
  residentEmail: string;
  residentUserId?: string | null;
}): boolean {
  const pid = input.propertyId.trim();
  if (!pid || !listingApplicationFeeOnlyFirstApplication(pid)) return false;
  const email = normalizeEmail(input.residentEmail);
  if (!email) return false;
  return residentHasPriorApplication(email) || residentHasPaidApplicationFee(email, input.residentUserId);
}

/** True only when this listing's manager opted into collecting the holding deposit at application (default is after approval, under Payments). */
export function listingCollectsHoldingDepositAtApplication(propertyId: string): boolean {
  const sub = getPropertyById(propertyId)?.listingSubmission;
  return sub?.holdingDepositTiming === "at_application";
}

export type ApplicationMoneyGate = {
  /** True while ANY amount (fee and/or deposit) is still owed before the applicant may submit. */
  needsFee: boolean;
  /** True once everything currently owed has been paid (or waived). */
  paid: boolean;
  displayLabel: string;
  /** Application fee dollars (0 if the listing has none, or it is waived). */
  amount: number;
  /** Fee waived via the "first application fee covers additional applications" policy (distinct from a manager waiver code, which the wizard applies separately). */
  waived: boolean;
  /** Holding deposit dollars due AT APPLICATION — 0 unless the listing opted into `holdingDepositTiming: "at_application"`. Never includes a deposit deferred to post-approval Payments. */
  depositAmount: number;
  /** Whether this listing collects its deposit at application at all (informational — `depositAmount` already reflects it). */
  depositAtApplication: boolean;
  /** Fee (if owed) + deposit (if owed), before any service fee — what the combined charge should total. */
  totalDue: number;
  /** True once the FEE leg specifically no longer needs paying (not owed at all, waived, or already paid) — independent of any deposit still due. Use this (not `paid`) to decide whether to still offer a waiver code. */
  feePaid: boolean;
};

export function residentApplicationFeeGate(input: {
  propertyId: string;
  residentEmail: string;
  residentUserId?: string | null;
  /**
   * A manager waiver code has already been redeemed server-side for the fee
   * (the wizard sets this after `/api/public/application-fee-waiver`
   * succeeds). Waives ONLY the fee — a holding deposit collected at
   * application still stands, since the waiver is an "application fee
   * waiver code" by name and by table, not a deposit waiver.
   */
  feeWaivedByCode?: boolean;
}): ApplicationMoneyGate {
  const pid = input.propertyId.trim();
  const email = input.residentEmail.trim();
  const { amount, displayLabel } = listingApplicationFeeAmount(pid);
  const waived = shouldWaiveApplicationFeeForResident(input);
  const depositAtApplication = listingCollectsHoldingDepositAtApplication(pid);
  const depositAmount = depositAtApplication ? listingHoldingDepositAmount(pid).amount : 0;

  const feeOwed = Boolean(pid) && email.includes("@") && amount > 0 && !waived && !input.feeWaivedByCode;
  const depositOwed = Boolean(pid) && email.includes("@") && depositAmount > 0;

  if (!feeOwed && !depositOwed) {
    return {
      needsFee: false,
      paid: true,
      displayLabel,
      amount,
      waived,
      depositAmount: 0,
      depositAtApplication,
      totalDue: 0,
      feePaid: true,
    };
  }

  const feeCharge = feeOwed ? findApplicationFeeCharge(email, pid, input.residentUserId ?? null) : null;
  const feePaid = !feeOwed || feeCharge?.status === "paid";
  const depositCharge = depositOwed ? findHoldingDepositCharge(email, pid, input.residentUserId ?? null) : null;
  const depositPaid = !depositOwed || depositCharge?.status === "paid";
  const paid = feePaid && depositPaid;

  return {
    needsFee: !paid,
    paid,
    displayLabel,
    amount: feeOwed ? amount : 0,
    waived,
    depositAmount: depositOwed ? depositAmount : 0,
    depositAtApplication,
    totalDue: (feeOwed ? amount : 0) + (depositOwed ? depositAmount : 0),
    feePaid,
  };
}

export function residentApplicationSubmitBlocked(input: {
  propertyId: string;
  residentEmail: string;
  roomChoice1?: string;
}): { blocked: boolean; reason?: string } {
  const pid = input.propertyId.trim();
  const email = normalizeEmail(input.residentEmail);
  if (!pid || !email) return { blocked: false };

  const sub = getPropertyById(pid)?.listingSubmission;
  const allowMultiple = sub?.allowMultiplePropertyApplications === true;
  const existing = applicationsForResidentEmail(email).filter((row) => !isInProgressApplicationRow(row));
  const room = input.roomChoice1?.trim() || "";

  if (!allowMultiple) {
    const active = existing.filter(
      (row) => (row.bucket === "pending" || row.bucket === "approved") && !isInProgressApplicationRow(row),
    );
    if (active.length > 0) {
      return {
        blocked: true,
        reason:
          "This listing only accepts one application per resident. Contact the property manager if you need to apply elsewhere.",
      };
    }
    return { blocked: false };
  }

  const duplicatePending = existing.some((row) => {
    if (row.bucket !== "pending" || isInProgressApplicationRow(row)) return false;
    const rowPid = row.propertyId?.trim() || row.application?.propertyId?.trim() || "";
    if (rowPid !== pid) return false;
    const rowRoom = row.application?.roomChoice1?.trim() || row.assignedRoomChoice?.trim() || "";
    return rowRoom === room;
  });
  if (duplicatePending) {
    return {
      blocked: true,
      reason: "You already have a pending application for this property and room.",
    };
  }

  return { blocked: false };
}

/** Residents may withdraw only applications still awaiting manager review. */
export function residentCanWithdrawApplication(row: DemoApplicantRow): boolean {
  return row.bucket === "pending";
}

export function listingApplicationSettingsSummary(sub: ManagerListingSubmissionV1 | null | undefined): {
  allowMultiplePropertyApplications: boolean;
  applicationFeeOnlyFirstApplication: boolean;
} {
  return {
    allowMultiplePropertyApplications: sub?.allowMultiplePropertyApplications === true,
    applicationFeeOnlyFirstApplication: sub?.applicationFeeOnlyFirstApplication === true,
  };
}
