import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { DemoApplicantRow } from "@/data/demo-portal";
import { manualResidentSignedLeasePdf } from "@/lib/existing-resident-onboarding";

/**
 * Whether `candidatePdf` is the already-executed lease the MANAGER filed onto
 * the application record (`manualResidentDetails.signedLeaseDataUrl`).
 *
 * `syncApprovedApplications` seeds the existing-resident onboarding lease from
 * that PDF, and it runs in the RESIDENT's browser too, so a resident's ordinary
 * sync legitimately posts a document body the server has not stored on the lease
 * row yet. Admitting that shape by believing the row's own
 * `externallySignedLease` flag would be trusting a field the request supplied —
 * and the same POST could then carry arbitrary bytes into the property owner's
 * document library. The bytes are the trust signal, so they are compared against
 * the copy the manager filed.
 *
 * `axisId` must come from the STORED lease row and `managerUserId` from its
 * stored owner column. Sourcing either from the request would let a caller aim
 * the corroboration at an application record of their choosing. Both writers of
 * this lease shape (`syncApprovedApplications` and `runExistingResidentOnboarding`)
 * set `axisId` to the application record's own id, so it is a direct lookup.
 *
 * Fails CLOSED: an unreadable application record corroborates nothing.
 */
export async function leaseBodyMatchesManagerFiledLease(
  db: SupabaseClient,
  axisId: string | null | undefined,
  managerUserId: string | null | undefined,
  candidatePdf: string | null | undefined,
): Promise<boolean> {
  const candidate = String(candidatePdf ?? "").trim();
  const applicationId = String(axisId ?? "").trim();
  const owner = String(managerUserId ?? "").trim();
  if (!candidate || !applicationId || !owner) return false;

  const { data, error } = await db
    .from("manager_application_records")
    .select("id, row_data")
    .eq("id", applicationId)
    .eq("manager_user_id", owner)
    .limit(1);
  if (error) {
    console.error("Manager-filed lease corroboration failed:", { applicationId, message: error.message });
    return false;
  }

  const applicationRow = (data?.[0]?.row_data ?? null) as DemoApplicantRow | null;
  if (!applicationRow) return false;
  const filed = manualResidentSignedLeasePdf(applicationRow);
  const filedPdf = String(filed?.originalDataUrl ?? filed?.dataUrl ?? "").trim();
  return Boolean(filedPdf) && filedPdf === candidate;
}
