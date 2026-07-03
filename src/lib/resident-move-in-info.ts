/** Server loader for resident move-in info — pure resolution lives in resident-move-in-resolve.ts (client-safe). */

import type { DemoApplicantRow } from "@/data/demo-portal";
import {
  asObject,
  propertyFromRecord,
  resolveBestResidentRow,
  resolveResidentMoveInFromApplications,
  type ResidentMoveInResolved,
} from "@/lib/resident-move-in-resolve";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export { resolveResidentMoveInFromApplications, type ResidentMoveInResolved };

export async function loadResidentMoveInForEmail(email: string): Promise<ResidentMoveInResolved | null> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return null;

  const db = createSupabaseServiceRoleClient();
  const { data: records } = await db
    .from("manager_application_records")
    .select("row_data, updated_at")
    .eq("resident_email", normalizedEmail)
    .order("updated_at", { ascending: false });

  const applications = (records ?? [])
    .map((record) => asObject(record.row_data))
    .filter((row): row is Record<string, unknown> => Boolean(row))
    .map((row) => row as unknown as DemoApplicantRow)
    .map((row) => ({ ...row, email: row.email?.trim().toLowerCase() || normalizedEmail }));

  const bestRow = resolveBestResidentRow(normalizedEmail, applications);
  if (!bestRow) return null;

  const propertyId =
    bestRow.assignedPropertyId?.trim() ||
    bestRow.propertyId?.trim() ||
    bestRow.application?.propertyId?.trim() ||
    "";

  if (!propertyId) {
    return resolveResidentMoveInFromApplications(normalizedEmail, applications, {});
  }

  const { data: propertyRecord } = await db
    .from("manager_property_records")
    .select("id, property_data, row_data")
    .eq("id", propertyId)
    .maybeSingle();

  const property = propertyRecord ? propertyFromRecord(propertyRecord) : undefined;
  return resolveResidentMoveInFromApplications(normalizedEmail, applications, {
    [propertyId]: property,
  });
}
