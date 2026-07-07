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

/** Enriches an application row and links the resident profile to the manager workspace on submit. */
export async function linkResidentOnApplicationSubmit(
  db: SupabaseClient,
  params: {
    userId: string;
    row: DemoApplicantRow;
    isNewSubmit: boolean;
  },
): Promise<DemoApplicantRow> {
  const propertyId = readPropertyId(params.row);
  let managerUserId = params.row.managerUserId?.trim() || null;

  if (!managerUserId && propertyId) {
    managerUserId = await resolveManagerUserIdForProperty(db, propertyId);
  }

  const normalizedRow: DemoApplicantRow = {
    ...params.row,
    id: normalizeApplicationAxisId(params.row.id),
    propertyId: propertyId || params.row.propertyId,
    managerUserId: managerUserId || params.row.managerUserId || null,
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

  return normalizedRow;
}
