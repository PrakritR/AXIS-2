import type { DemoApplicantRow } from "@/data/demo-portal";
import {
  readManagerApplicationRows,
  replaceManagerApplicationRowInCache,
  upsertApplicationRowToServer,
} from "@/lib/manager-applications-storage";
import { getPropertyById } from "@/lib/rental-application/data";
import type { RentalWizardFormState } from "@/lib/rental-application/types";

export const IN_PROGRESS_APPLICATION_STAGE = "In progress";

export function isInProgressApplicationRow(row: DemoApplicantRow): boolean {
  return row.bucket === "pending" && row.stage.trim().toLowerCase() === IN_PROGRESS_APPLICATION_STAGE.toLowerCase();
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

export function syncInProgressApplicationRow(input: {
  axisId: string;
  form: RentalWizardFormState;
  residentEmail: string;
}): void {
  const existing = readManagerApplicationRows().find((row) => row.id === input.axisId);
  if (existing && !isInProgressApplicationRow(existing)) return;

  const row = buildInProgressApplicationRow(input);
  replaceManagerApplicationRowInCache(row);
  upsertApplicationRowToServer(row);
}
