import type { DemoApplicantRow } from "@/data/demo-portal";
import { normalizeApplicationAxisId } from "@/lib/manager-applications-storage";
import type { SupabaseClient } from "@supabase/supabase-js";

function readPropertyId(row: DemoApplicantRow): string {
  return (
    row.propertyId?.trim() ||
    row.assignedPropertyId?.trim() ||
    row.application?.propertyId?.trim() ||
    ""
  );
}

async function resolveManagerUserIdForProperty(
  db: SupabaseClient,
  propertyId: string,
): Promise<string | null> {
  const { data: propertyRecord } = await db
    .from("manager_property_records")
    .select("manager_user_id, property_data")
    .eq("id", propertyId)
    .maybeSingle();

  const direct = typeof propertyRecord?.manager_user_id === "string" ? propertyRecord.manager_user_id.trim() : "";
  if (direct) return direct;

  const propertyData =
    propertyRecord?.property_data && typeof propertyRecord.property_data === "object" && !Array.isArray(propertyRecord.property_data)
      ? (propertyRecord.property_data as Record<string, unknown>)
      : null;
  const fromData = typeof propertyData?.managerUserId === "string" ? propertyData.managerUserId.trim() : "";
  return fromData || null;
}

export type ResidentApplicationSubmitResult =
  | { ok: true; row: DemoApplicantRow }
  | { ok: false; status: number; error: string };

/**
 * Enriches an application row and links the resident profile to the manager workspace on submit.
 * Attribution is derived from the listing (or the already-stored value on an edit) — never from
 * the request body, since `managerUserId` alone decides who sees the row in the manager portal.
 */
export async function linkResidentOnApplicationSubmit(
  db: SupabaseClient,
  params: {
    userId: string;
    row: DemoApplicantRow;
    isNewSubmit: boolean;
    existingManagerUserId?: string | null;
  },
): Promise<ResidentApplicationSubmitResult> {
  const propertyId = readPropertyId(params.row);
  const resolvedManagerUserId = propertyId ? await resolveManagerUserIdForProperty(db, propertyId) : null;
  const managerUserId = resolvedManagerUserId || params.existingManagerUserId?.trim() || null;

  if (!managerUserId && params.isNewSubmit) {
    return { ok: false, status: 400, error: "This listing cannot accept applications yet." };
  }

  const normalizedRow: DemoApplicantRow = {
    ...params.row,
    id: normalizeApplicationAxisId(params.row.id),
    propertyId: propertyId || params.row.propertyId,
    managerUserId,
  };

  const axisId = normalizeApplicationAxisId(normalizedRow.id);
  const { data: existingProfile } = await db
    .from("profiles")
    .select("manager_id")
    .eq("id", params.userId)
    .maybeSingle();

  const existingAxisId = typeof existingProfile?.manager_id === "string" ? existingProfile.manager_id.trim() : "";
  if (params.isNewSubmit || !existingAxisId) {
    await db.from("profiles").update({ manager_id: axisId }).eq("id", params.userId);
  }

  return { ok: true, row: normalizedRow };
}
