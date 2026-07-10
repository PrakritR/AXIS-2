import "server-only";

import { linkedOwnerScopeForModule } from "@/lib/auth/co-manager-module-scope";
import type { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

type ServiceClient = ReturnType<typeof createSupabaseServiceRoleClient>;

/**
 * Effective manager id whose financial books a report should read.
 *
 * Financial reports (income statement, balance sheet, trial balance, GL, rent
 * roll, expenses…) aggregate ledger/GL rows that aren't all property-tagged, so
 * they can't be filtered per property the way list modules are. Financials is
 * therefore treated as an OWNER-LEVEL grant, matching the vendor-directory
 * precedent (`linkedOwnerScopeForModule`): a co-manager granted `financials` on
 * any assigned property reads that owner's books.
 *
 * Resolution:
 * - A primary manager (owns ≥1 property) always reads their OWN books.
 * - A pure co-manager reads the books of an owner who granted them `financials`.
 *   With more than one such owner we pick the lowest owner id deterministically;
 *   a per-owner selector for multi-owner co-managers is future work (the report
 *   UI has no owner picker yet).
 * - Otherwise (no ownership, no financials grant) it falls back to the user's own
 *   id, so they only ever see their own — empty — books, never someone else's.
 *
 * Because substitution happens ONLY when a financials grant exists, this doubles
 * as the access check: a co-manager without `financials` can never reach an
 * owner's books through it.
 */
export async function resolveManagerReportOwnerId(
  db: ServiceClient,
  userId: string,
): Promise<string> {
  const { data: owned } = await db
    .from("manager_property_records")
    .select("id")
    .eq("manager_user_id", userId)
    .limit(1);
  if ((owned ?? []).length > 0) return userId;

  const { ownerIds } = await linkedOwnerScopeForModule(db, userId, "financials");
  if (ownerIds.size === 0) return userId;
  return [...ownerIds].sort()[0];
}
