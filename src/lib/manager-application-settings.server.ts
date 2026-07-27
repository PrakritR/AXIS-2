import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizeManagerListingSubmissionV1, type ManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";
import { parseMoneyAmount } from "@/lib/parse-money";

function listingFromPropertyData(propertyData: unknown): ManagerListingSubmissionV1 | null {
  if (!propertyData || typeof propertyData !== "object") return null;
  const submission = (propertyData as { listingSubmission?: unknown }).listingSubmission;
  if (!submission || typeof submission !== "object") return null;
  if ((submission as { v?: unknown }).v !== 1) return null;
  return normalizeManagerListingSubmissionV1(submission as ManagerListingSubmissionV1);
}

/**
 * A non-authoritative suggested application fee (cents) for a manager who has
 * not yet configured a manager-level value — the mode (most common) positive
 * per-listing fee across their existing listings, matching the SAME read path
 * the applicant's fee checkout uses (`property_data.listingSubmission`). The
 * settings modal pre-fills this so the manager confirms an explicit value; it
 * is never persisted on its own, so no existing listing's charge changes until
 * the manager saves. Returns `null` when they have no listing with a fee.
 */
export async function suggestedManagerApplicationFeeCents(
  db: SupabaseClient,
  managerUserId: string,
): Promise<number | null> {
  const { data: rows, error } = await db
    .from("manager_property_records")
    .select("property_data")
    .eq("manager_user_id", managerUserId);
  if (error) throw error;

  const counts = new Map<number, number>();
  for (const row of rows ?? []) {
    const listing = listingFromPropertyData(row.property_data);
    if (!listing) continue;
    const cents = Math.round(parseMoneyAmount(listing.applicationFee ?? "") * 100);
    if (cents <= 0) continue;
    counts.set(cents, (counts.get(cents) ?? 0) + 1);
  }
  if (counts.size === 0) return null;

  let best: number | null = null;
  let bestCount = -1;
  // Deterministic: highest count wins; ties broken by the larger fee so the
  // suggestion never under-quotes what some of their listings already charge.
  for (const [cents, count] of counts) {
    if (count > bestCount || (count === bestCount && best !== null && cents > best)) {
      best = cents;
      bestCount = count;
    }
  }
  return best;
}
