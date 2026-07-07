import type { DemoApplicantRow } from "@/data/demo-portal";
import {
  readChargesForResident,
  findApplicationFeeCharge,
  listingApplicationFeeAmount,
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

export function residentApplicationFeeGate(input: {
  propertyId: string;
  residentEmail: string;
  residentUserId?: string | null;
}): { needsFee: boolean; paid: boolean; displayLabel: string; amount: number; waived: boolean } {
  const pid = input.propertyId.trim();
  const email = input.residentEmail.trim();
  const { amount, displayLabel } = listingApplicationFeeAmount(pid);
  const waived = shouldWaiveApplicationFeeForResident(input);
  if (!pid || !email.includes("@") || amount <= 0 || waived) {
    return { needsFee: false, paid: true, displayLabel, amount, waived };
  }
  const charge = findApplicationFeeCharge(email, pid, input.residentUserId ?? null);
  const paid = charge?.status === "paid";
  return { needsFee: true, paid, displayLabel, amount, waived: false };
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
