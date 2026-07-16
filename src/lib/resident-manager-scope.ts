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

type ApplicationScopeRow = {
  manager_user_id: string | null;
  property_id: string | null;
  assigned_property_id?: string | null;
  row_data?: Record<string, unknown> | null;
  updated_at?: string | null;
};

export function applicationBucket(rowData: unknown): string {
  if (!rowData || typeof rowData !== "object" || Array.isArray(rowData)) return "";
  return String((rowData as { bucket?: string }).bucket ?? "").trim().toLowerCase();
}

export function isApprovedApplicationRow(row: { row_data?: unknown }): boolean {
  return applicationBucket(row.row_data) === "approved";
}

export async function residentHasApprovedResidency(
  db: ServiceRoleDb,
  params: { residentEmail: string; managerUserId: string },
): Promise<boolean> {
  const residentEmail = params.residentEmail.trim().toLowerCase();
  const managerUserId = params.managerUserId.trim();
  if (!residentEmail || !managerUserId) return false;

  const { data, error } = await db
    .from("manager_application_records")
    .select("row_data")
    .eq("manager_user_id", managerUserId)
    .eq("resident_email", residentEmail)
    .limit(25);
  if (error) throw new Error(error.message);
  return (data ?? []).some((row) => isApprovedApplicationRow(row));
}

function propertyIdFromApplication(row: ApplicationScopeRow): string {
  const fromCols =
    String(row.assigned_property_id ?? "").trim() || String(row.property_id ?? "").trim();
  if (fromCols) return fromCols;
  const rd = row.row_data ?? {};
  return (
    String(rd.assignedPropertyId ?? "").trim() ||
    String(rd.propertyId ?? "").trim() ||
    String((rd.application as { propertyId?: string } | undefined)?.propertyId ?? "").trim()
  );
}

/**
 * Prefer approved residencies over pending apps when stamping filings.
 * Test residents often have leftover pending apps at other managers/properties —
 * using the newest row blindly routes service requests into the wrong queue.
 */
function preferApprovedThenRecent(rows: ApplicationScopeRow[]): ApplicationScopeRow[] {
  const approved = rows.filter(isApprovedApplicationRow);
  return approved.length > 0 ? approved : rows;
}

/**
 * Resolve which manager + property a resident filing should be stamped with.
 * Prefer approved residencies; within that set, honor the client-claimed
 * manager/property when they match. Pending leftover apps never win over an
 * approved lease residency.
 */
export async function resolveResidentFilingScope(
  db: ServiceRoleDb,
  params: {
    residentEmail: string;
    claimedManagerUserId?: string | null;
    claimedPropertyId?: string | null;
  },
): Promise<{ managerUserId: string; propertyId: string } | null> {
  const residentEmail = params.residentEmail.trim().toLowerCase();
  if (!residentEmail) return null;

  const { data, error } = await db
    .from("manager_application_records")
    .select("manager_user_id, property_id, assigned_property_id, row_data, updated_at")
    .eq("resident_email", residentEmail)
    .order("updated_at", { ascending: false })
    .limit(25);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as ApplicationScopeRow[];
  if (rows.length === 0) return null;

  const claimedManager = params.claimedManagerUserId?.trim() || "";
  const claimedProperty = params.claimedPropertyId?.trim() || "";

  // Approved residencies first — across all managers — then optionally narrow
  // to the claimed manager if that claim is also approved (or no approvals).
  const preferred = preferApprovedThenRecent(rows);
  const forClaimedManager = claimedManager
    ? preferred.filter((r) => String(r.manager_user_id ?? "").trim() === claimedManager)
    : preferred;

  let pool: ApplicationScopeRow[];
  if (forClaimedManager.length > 0) {
    pool = forClaimedManager;
  } else if (claimedManager) {
    // Claimed manager only has pending (or no) rows while another manager has
    // approved — stamp against approved residency instead of rejecting/wrong queue.
    pool = preferred;
  } else {
    pool = preferred;
  }

  const propertyMatch = claimedProperty
    ? pool.find((r) => propertyIdFromApplication(r) === claimedProperty)
    : undefined;
  const chosen = propertyMatch ?? pool[0]!;
  const managerUserId = String(chosen.manager_user_id ?? "").trim();
  if (!managerUserId) return null;
  const propertyId = propertyIdFromApplication(chosen) || claimedProperty;
  return { managerUserId, propertyId };
}
