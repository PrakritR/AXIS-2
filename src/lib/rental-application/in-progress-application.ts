import type { DemoApplicantRow } from "@/data/demo-portal";
import {
  readManagerApplicationRows,
  replaceManagerApplicationRowInCache,
  upsertApplicationRowToServer,
  wouldDowngradeSubmittedApplication,
} from "@/lib/manager-applications-storage";
import { getPropertyById } from "@/lib/rental-application/data";
import type { RentalWizardFormState } from "@/lib/rental-application/types";

export const IN_PROGRESS_APPLICATION_STAGE = "In progress";

export function isInProgressApplicationRow(row: DemoApplicantRow): boolean {
  return row.bucket === "pending" && row.stage.trim().toLowerCase() === IN_PROGRESS_APPLICATION_STAGE.toLowerCase();
}

/** Submitted applications awaiting manager review (pending bucket, not a draft). */
export function isSubmittedPendingApplicationRow(row: DemoApplicantRow): boolean {
  return row.bucket === "pending" && !isInProgressApplicationRow(row);
}

export function inProgressApplicationResumeUrl(origin: string, row: DemoApplicantRow): string {
  const base = origin.replace(/\/$/, "");
  const pid = row.propertyId?.trim() || row.application?.propertyId?.trim();
  const path = pid
    ? `/resident/applications/apply?propertyId=${encodeURIComponent(pid)}`
    : "/resident/applications/apply";
  return `${base}${path}`;
}

export function buildInProgressApplicationRow(input: {
  axisId: string;
  form: RentalWizardFormState;
  residentEmail: string;
}): DemoApplicantRow {
  const pid = input.form.propertyId.trim();
  const prop = pid ? getPropertyById(pid) : undefined;
  const email = input.residentEmail.trim();
  const name = input.form.fullLegalName.trim() || "Applicant";

  return {
    id: input.axisId,
    name,
    property: (prop?.title?.trim() || pid) || "Listing",
    propertyId: pid || undefined,
    managerUserId: prop?.managerUserId ?? null,
    stage: IN_PROGRESS_APPLICATION_STAGE,
    bucket: "pending",
    backgroundCheckStatus: "pending_review",
    detail: `Started ${new Date().toLocaleString()}`,
    email,
    application: structuredClone(input.form),
  };
}

const submitInitiatedAxisIds = new Set<string>();

/**
 * Marks an axis id as having entered submit, so the wizard's per-keystroke draft
 * effect stops issuing draft writes for it. This is only a cheap second layer —
 * the authoritative defense is the conditional write in the API route, which no
 * caller can bypass.
 */
export function markApplicationSubmitInitiated(axisId: string): void {
  const id = axisId.trim();
  if (id) submitInitiatedAxisIds.add(id);
}

export function syncInProgressApplicationRow(input: {
  axisId: string;
  form: RentalWizardFormState;
  residentEmail: string;
}): void {
  const row = buildInProgressApplicationRow(input);
  if (submitInitiatedAxisIds.has(row.id.trim())) return;
  // Never walk a submitted application back to a draft. The server enforces this
  // too (a draft POST can still be in flight when submit lands); this keeps the
  // local cache honest and avoids issuing the doomed write at all.
  const existing = readManagerApplicationRows().find((cached) => cached.id === row.id);
  if (wouldDowngradeSubmittedApplication(existing, row)) return;

  replaceManagerApplicationRowInCache(row);
  upsertApplicationRowToServer(row);
}
