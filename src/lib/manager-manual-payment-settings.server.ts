import type { SupabaseClient } from "@supabase/supabase-js";

import type { ManagerManualPaymentSettings } from "@/lib/manager-manual-payment-settings";
import type { ManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function patchSubmission(
  submission: ManagerListingSubmissionV1,
  settings: ManagerManualPaymentSettings,
): ManagerListingSubmissionV1 {
  return {
    ...submission,
    axisPaymentsEnabled: settings.axisPaymentsEnabled,
    zellePaymentsEnabled: settings.zellePaymentsEnabled,
    zelleContact: settings.zelleContact,
    venmoPaymentsEnabled: settings.venmoPaymentsEnabled,
    venmoContact: settings.venmoContact,
    applicationFeeStripeEnabled: settings.axisPaymentsEnabled,
    applicationFeeZelleEnabled: settings.zellePaymentsEnabled,
    applicationFeeVenmoEnabled: settings.venmoPaymentsEnabled,
  };
}

/** Push manager Zelle/Venmo defaults onto every owned property record. */
export async function applyManagerManualPaymentsToListings(
  db: SupabaseClient,
  managerUserId: string,
  settings: ManagerManualPaymentSettings,
): Promise<number> {
  const { data: rows, error } = await db
    .from("manager_property_records")
    .select("id, row_data")
    .eq("manager_user_id", managerUserId);
  if (error) throw error;
  let updated = 0;
  for (const row of rows ?? []) {
    const rowData = asObject(row.row_data);
    const submission = rowData.submission as ManagerListingSubmissionV1 | undefined;
    if (!submission || typeof submission !== "object") continue;
    const nextSubmission = patchSubmission(submission, settings);
    const { error: upsertError } = await db
      .from("manager_property_records")
      .update({
        row_data: { ...rowData, submission: nextSubmission },
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (upsertError) throw upsertError;
    updated += 1;
  }
  return updated;
}

/** Refresh Zelle/Venmo contact snapshots on unpaid charges after manager updates payment settings. */
export async function syncManagerManualPaymentsToPendingCharges(
  db: SupabaseClient,
  managerUserId: string,
  settings: ManagerManualPaymentSettings,
): Promise<number> {
  const zelleSnap = settings.zellePaymentsEnabled ? settings.zelleContact.trim() : "";
  const venmoSnap = settings.venmoPaymentsEnabled ? settings.venmoContact.trim() : "";

  const { data: rows, error } = await db
    .from("portal_household_charge_records")
    .select("id, row_data, status, manager_user_id, resident_user_id, resident_email, property_id, kind")
    .eq("manager_user_id", managerUserId)
    .in("status", ["pending", "failed", "partially_paid"]);
  if (error) throw error;

  const now = new Date().toISOString();
  let updated = 0;
  for (const row of rows ?? []) {
    const charge = row.row_data as Record<string, unknown> | null;
    if (!charge || typeof charge !== "object") continue;
    const next = {
      ...charge,
      zelleContactSnapshot: zelleSnap || undefined,
      venmoContactSnapshot: venmoSnap || undefined,
    };
    const prevZelle = String(charge.zelleContactSnapshot ?? "").trim();
    const prevVenmo = String(charge.venmoContactSnapshot ?? "").trim();
    if (prevZelle === zelleSnap && prevVenmo === venmoSnap) continue;

    const { error: upsertError } = await db.from("portal_household_charge_records").upsert(
      {
        id: String(row.id),
        manager_user_id: managerUserId,
        resident_user_id: row.resident_user_id ?? null,
        resident_email: row.resident_email ?? null,
        property_id: row.property_id ?? null,
        kind: row.kind ?? null,
        status: row.status ?? null,
        row_data: next,
        updated_at: now,
      },
      { onConflict: "id" },
    );
    if (upsertError) throw upsertError;
    updated += 1;
  }
  return updated;
}
