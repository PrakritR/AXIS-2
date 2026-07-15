/**
 * Pure resident-resolution helper shared by the write tools. Security-critical:
 * a model-supplied email resolves ONLY against the authenticated landlord's own
 * approved residents, so a write action can never target an arbitrary address
 * or another landlord's tenant.
 */
import type { DemoApplicantRow } from "@/data/demo-portal";

export function findOwnedResident(
  managerApplications: DemoApplicantRow[],
  email: string,
): DemoApplicantRow | null {
  const wanted = String(email ?? "").trim().toLowerCase();
  if (!wanted) return null;
  return (
    managerApplications.find(
      (r) => r.bucket === "approved" && String(r.email ?? "").trim().toLowerCase() === wanted,
    ) ?? null
  );
}
