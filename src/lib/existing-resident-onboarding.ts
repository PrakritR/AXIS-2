/**
 * Existing-resident onboarding helpers (manager-added tenants, not applicants).
 */

import type { DemoApplicantRow } from "@/data/demo-portal";
import type { LeasePipelineRow } from "@/lib/lease-pipeline-storage";

export function manualResidentSignedLeasePdf(
  row: Pick<DemoApplicantRow, "manualResidentDetails">,
): LeasePipelineRow["managerUploadedPdf"] {
  const details = row.manualResidentDetails;
  if (!details?.signedLeaseDataUrl?.trim()) return null;
  return {
    dataUrl: details.signedLeaseDataUrl.trim(),
    fileName: details.signedLeaseFileName?.trim() || "signed-lease.pdf",
    uploadedAt: details.signedLeaseUploadedAt?.trim() || new Date().toISOString(),
    originalDataUrl: details.signedLeaseDataUrl.trim(),
  };
}

export function existingResidentOnboardingWelcomeSent(row: DemoApplicantRow): boolean {
  return Boolean(row.manualResidentDetails?.onboardingWelcomeSentAt?.trim());
}
