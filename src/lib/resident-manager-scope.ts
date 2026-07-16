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
/**
 * Manager user ids that own the given resident: approved application records
 * plus any charge/lease records keyed by the resident's email. This is the
 * authoritative "who are my managers" resolver, shared by the inbox recipient
 * scope and the resident agent context.
 */
export async function managerIdsOwningResident(
  db: ServiceRoleDb,
  residentEmail: string,
): Promise<string[]> {
  const email = residentEmail.trim().toLowerCase();
  if (!email) return [];
  const ids = new Set<string>();

  const { data: apps } = await db
    .from("manager_application_records")
    .select("manager_user_id, row_data")
    .eq("resident_email", email);
  for (const row of apps ?? []) {
    const rowData = (row.row_data ?? {}) as Record<string, unknown>;
    if (rowData.bucket !== "approved") continue;
    const id = String(row.manager_user_id ?? "").trim();
    if (id) ids.add(id);
  }

  for (const table of ["portal_household_charge_records", "portal_lease_pipeline_records"] as const) {
    const { data } = await db.from(table).select("manager_user_id").eq("resident_email", email);
    for (const row of data ?? []) {
      const id = String(row.manager_user_id ?? "").trim();
      if (id) ids.add(id);
    }
  }

  return [...ids];
}

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
