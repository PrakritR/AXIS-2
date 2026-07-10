import type { DemoApplicantRow } from "@/data/demo-portal";
import { attachResidentSetupToken } from "@/lib/auth/resident-setup-token";
import { normalizeApplicationAxisId } from "@/lib/manager-applications-storage";
import type { SupabaseClient } from "@supabase/supabase-js";

const EMAIL_RE = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

export type GuestApplicationUpsertResult =
  | { ok: true; row: DemoApplicantRow; setupToken: string }
  | { ok: false; status: number; error: string };

export function isValidGuestApplicationEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim().toLowerCase());
}

export async function resolveManagerUserIdForProperty(
  db: SupabaseClient,
  propertyId: string,
): Promise<string | null> {
  const trimmed = propertyId.trim();
  if (!trimmed) return null;

  const { data: propertyRecord } = await db
    .from("manager_property_records")
    .select("manager_user_id, property_data")
    .eq("id", trimmed)
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

/**
 * Authorize and prepare a guest (unauthenticated) application upsert.
 * Guests may only write pending rows for their own email, scoped to a listing's manager.
 */
export async function prepareGuestApplicationUpsert(
  db: SupabaseClient,
  params: {
    row: DemoApplicantRow;
    existing?: DemoApplicantRow | null;
  },
): Promise<GuestApplicationUpsertResult> {
  const email = (params.row.email ?? "").trim().toLowerCase();
  if (!isValidGuestApplicationEmail(email)) {
    return { ok: false, status: 400, error: "A valid email is required to submit without an account." };
  }

  if (params.row.bucket !== "pending") {
    return { ok: false, status: 403, error: "Guests can only submit pending applications." };
  }

  if (params.existing && params.existing.bucket !== "pending") {
    return { ok: false, status: 403, error: "This application can no longer be edited." };
  }

  const existingEmail = (params.existing?.email ?? "").trim().toLowerCase();
  if (params.existing && existingEmail && existingEmail !== email) {
    return { ok: false, status: 403, error: "You can only update your own application." };
  }

  const propertyId =
    params.row.propertyId?.trim() ||
    params.row.assignedPropertyId?.trim() ||
    params.row.application?.propertyId?.trim() ||
    "";
  if (!propertyId) {
    return { ok: false, status: 400, error: "A property is required to submit an application." };
  }

  const managerUserId =
    (await resolveManagerUserIdForProperty(db, propertyId)) ||
    params.existing?.managerUserId?.trim() ||
    params.row.managerUserId?.trim() ||
    null;

  if (!managerUserId) {
    return { ok: false, status: 400, error: "This listing cannot accept applications yet." };
  }

  const baseRow: DemoApplicantRow = {
    ...params.row,
    id: normalizeApplicationAxisId(params.row.id),
    email,
    bucket: "pending",
    propertyId,
    managerUserId,
    // Guests cannot escalate manager-controlled fields.
    assignedPropertyId: params.existing?.assignedPropertyId ?? params.row.assignedPropertyId,
    assignedRoomChoice: params.existing?.assignedRoomChoice ?? params.row.assignedRoomChoice,
    signedMonthlyRent: params.existing?.signedMonthlyRent ?? params.row.signedMonthlyRent,
    backgroundCheckStatus: params.existing?.backgroundCheckStatus ?? params.row.backgroundCheckStatus,
    screening: params.existing?.screening ?? params.row.screening,
    manuallyAdded: params.existing?.manuallyAdded ?? params.row.manuallyAdded,
    moveInInstructions: params.existing?.moveInInstructions ?? params.row.moveInInstructions,
    application:
      params.row.application && params.existing?.application
        ? {
            ...params.row.application,
            managerRentOverride: params.existing.application.managerRentOverride,
            managerUtilitiesOverride: params.existing.application.managerUtilitiesOverride,
            managerSecurityDepositOverride: params.existing.application.managerSecurityDepositOverride,
            managerMoveInFeeOverride: params.existing.application.managerMoveInFeeOverride,
            managerOtherCostLabel: params.existing.application.managerOtherCostLabel,
            managerOtherCostAmount: params.existing.application.managerOtherCostAmount,
          }
        : params.row.application,
  };

  const { row, token } = attachResidentSetupToken(baseRow);
  return { ok: true, row, setupToken: token };
}
