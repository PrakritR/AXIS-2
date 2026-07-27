import { linkedPropertyIdsForModule } from "@/lib/auth/co-manager-module-scope";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

type ServiceClient = ReturnType<typeof createSupabaseServiceRoleClient>;

/** The columns any by-id application action must load to authorize the caller. */
export type ApplicationAccessRecord = {
  manager_user_id?: string | null;
  property_id?: string | null;
  assigned_property_id?: string | null;
};

/**
 * Does this manager have access to one application record?
 *
 * This is the SAME visibility test the Applications list uses
 * (`fetchApplicationsForManagerUser`): a record is the caller's when its stored
 * `manager_user_id` matches, OR the caller owns / co-manages the record's
 * property. Application `manager_user_id` is frozen at submit time and never
 * re-resolved for an abandoned "Incomplete" draft, so a property that changed
 * hands (or an unattributed draft) keeps a stale stamp — the list still shows
 * the row via property ownership, and every by-id ACTION (delete, PDF, …) MUST
 * authorize the same way or it 403s on a row the manager can plainly see.
 * Property ownership, not the frozen stamp, is the source of truth for access.
 */
export async function managerCanAccessApplicationRecord(
  db: ServiceClient,
  userId: string,
  record: ApplicationAccessRecord,
): Promise<boolean> {
  if (!userId) return false;
  if (record.manager_user_id && record.manager_user_id === userId) return true;

  const candidateIds = [
    String(record.property_id ?? "").trim(),
    String(record.assigned_property_id ?? "").trim(),
  ].filter(Boolean);
  if (candidateIds.length === 0) return false;

  // Direct ownership — the list's `manager_property_records.manager_user_id = userId`.
  const { data: owned } = await db
    .from("manager_property_records")
    .select("id")
    .eq("manager_user_id", userId)
    .in("id", candidateIds)
    .limit(1);
  if ((owned ?? []).length > 0) return true;

  // Co-manager grant on EITHER the applications or residents module — the same
  // union the list applies (the client then filters each tab by its own grant).
  const [appIds, resIds] = await Promise.all([
    linkedPropertyIdsForModule(db, userId, "applications"),
    linkedPropertyIdsForModule(db, userId, "residents"),
  ]);
  return candidateIds.some((id) => appIds.has(id) || resIds.has(id));
}
