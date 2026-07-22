import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Security: a co-manager invite's `assigned_property_ids` is the ownership key
 * every downstream co-manager gate reads (`manager-lease-scope.ts` →
 * `assertCoManagerModuleAccess`). It was previously stored verbatim from the
 * request body, so a manager could name **another manager's** property id —
 * harvested from the public `GET /api/property-records/public` listing feed —
 * and, once the invite was accepted, pass every module gate on that property:
 * read leases, financials and documents, edit the listing, even delete it.
 *
 * An empty permissions object resolves to a *full* grant
 * (`manager-lease-scope.ts`), so a forged link with `{}` yields maximum access.
 * The list must therefore be validated against real ownership, not trusted.
 *
 * Returns the ids in `propertyIds` that `managerUserId` does NOT own. An empty
 * array means every id checked out. Ids that do not exist at all are reported
 * as unowned — absence is not permission.
 */
export async function findPropertyIdsNotOwnedByManager(
  db: SupabaseClient,
  managerUserId: string,
  propertyIds: string[],
): Promise<{ ok: true; unowned: string[] } | { ok: false; error: string }> {
  const unique = [...new Set(propertyIds.map((id) => String(id).trim()).filter(Boolean))];
  if (unique.length === 0) return { ok: true, unowned: [] };

  const { data, error } = await db
    .from("manager_property_records")
    .select("id")
    .eq("manager_user_id", managerUserId)
    .in("id", unique);

  // Fail closed: if ownership cannot be established, no id is treated as owned.
  if (error) return { ok: false, error: error.message };

  const owned = new Set((data ?? []).map((row) => String((row as { id: unknown }).id)));
  return { ok: true, unowned: unique.filter((id) => !owned.has(id)) };
}

export type InviteAssignment = { inviterUserId: string; propertyIds: string[] };

/**
 * The consumption-side half of the same gate. Validating on write only closes
 * the hole for rows created afterwards: an invite forged before the gate landed
 * is still sitting in `account_link_invites`, and a property legitimately
 * assigned once may since have been transferred to a different manager. So the
 * scope resolvers re-derive "the inviter still owns this" every time they turn
 * an accepted link into access.
 *
 * Resolves the whole set in ONE batched query and returns a predicate, so a
 * caller holding many links does not issue a query per property.
 *
 * Fails closed: a lookup error, a missing property row, or an owner that is not
 * the inviter all resolve to "not owned".
 */
export async function resolveInviterOwnedProperties(
  db: SupabaseClient,
  assignments: InviteAssignment[],
): Promise<(inviterUserId: string, propertyId: string) => boolean> {
  const deny = () => false;
  const ids = [
    ...new Set(assignments.flatMap((a) => a.propertyIds.map((id) => String(id).trim()).filter(Boolean))),
  ];
  if (ids.length === 0) return deny;

  const { data, error } = await db.from("manager_property_records").select("id, manager_user_id").in("id", ids);
  if (error) return deny;

  const ownerByPropertyId = new Map<string, string>();
  for (const row of data ?? []) {
    const id = String((row as { id?: unknown }).id ?? "").trim();
    const owner = String((row as { manager_user_id?: unknown }).manager_user_id ?? "").trim();
    if (id && owner) ownerByPropertyId.set(id, owner);
  }

  return (inviterUserId, propertyId) => {
    const inviter = String(inviterUserId ?? "").trim();
    const owner = ownerByPropertyId.get(String(propertyId ?? "").trim());
    return Boolean(inviter) && owner === inviter;
  };
}
