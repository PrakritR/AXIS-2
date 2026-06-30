import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

type ServiceRoleDb = ReturnType<typeof createSupabaseServiceRoleClient>;

/**
 * Authoritative per-landlord check for resident-originated portal writes.
 *
 * A resident may only write a record (service request, work order, ...) into a
 * manager's queue if that manager actually has the resident on a residency
 * record. Residents are approved/managed applicants, so the source of truth for
 * "which manager owns this resident" is `manager_application_records`, keyed by
 * the lowercased `resident_email` and `manager_user_id`. We deliberately do NOT
 * accept property ownership as a substitute signal: a manager's `live` listings
 * are publicly selectable, so any resident could discover an unrelated manager's
 * property id and inject a row into that manager's queue.
 */
export async function residentBelongsToManager(
  db: ServiceRoleDb,
  params: { residentEmail: string; managerUserId: string },
): Promise<boolean> {
  const residentEmail = params.residentEmail.trim().toLowerCase();
  const managerUserId = params.managerUserId.trim();
  if (!residentEmail || !managerUserId) return false;

  const { data, error } = await db
    .from("manager_application_records")
    .select("id")
    .eq("manager_user_id", managerUserId)
    .eq("resident_email", residentEmail)
    .limit(1);
  if (error) throw new Error(error.message);
  return Array.isArray(data) && data.length > 0;
}
