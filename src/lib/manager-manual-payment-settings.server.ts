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
    zellePaymentsEnabled: settings.zellePaymentsEnabled,
    zelleContact: settings.zelleContact,
    venmoPaymentsEnabled: settings.venmoPaymentsEnabled,
    venmoContact: settings.venmoContact,
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
