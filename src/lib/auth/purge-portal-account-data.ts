import type { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

type ServiceDb = ReturnType<typeof createSupabaseServiceRoleClient>;

function assertNoDeleteErrors(results: { error: { message: string } | null }[]) {
  const failed = results.find((result) => result.error);
  if (failed?.error) throw new Error(failed.error.message);
}

/** Remove leases, payments, applications, and other portal rows for a resident. */
export async function purgeResidentPortalData(
  db: ServiceDb,
  input: { email?: string; userId?: string | null; applicationId?: string | null },
): Promise<void> {
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const userId = input.userId ?? null;
  const applicationId = typeof input.applicationId === "string" ? input.applicationId.trim() : "";

  const deleteOps: PromiseLike<{ error: { message: string } | null }>[] = [];

  if (email) {
    deleteOps.push(
      db.from("portal_household_charge_records").delete().eq("resident_email", email),
      db.from("portal_recurring_rent_profile_records").delete().eq("resident_email", email),
      db.from("portal_lease_pipeline_records").delete().eq("resident_email", email),
      db.from("portal_work_order_records").delete().eq("resident_email", email),
      db.from("portal_inbox_thread_records").delete().eq("participant_email", email),
      db.from("portal_outbound_mail_records").delete().eq("recipient_email", email),
      db.from("portal_resident_lease_upload_records").delete().eq("resident_email", email),
      db.from("manager_application_records").delete().eq("resident_email", email),
      db.from("portal_bug_feedback_records").delete().eq("reporter_email", email),
      db.from("portal_household_charge_records").delete().filter("row_data->>residentEmail", "eq", email),
      db.from("portal_recurring_rent_profile_records").delete().filter("row_data->>residentEmail", "eq", email),
      db.from("portal_lease_pipeline_records").delete().filter("row_data->>residentEmail", "eq", email),
      db.from("portal_work_order_records").delete().filter("row_data->>residentEmail", "eq", email),
      db.from("portal_resident_lease_upload_records").delete().filter("row_data->>residentEmail", "eq", email),
    );
  }

  if (userId) {
    deleteOps.push(
      db.from("portal_household_charge_records").delete().eq("resident_user_id", userId),
      db.from("portal_recurring_rent_profile_records").delete().eq("resident_user_id", userId),
      db.from("portal_lease_pipeline_records").delete().eq("resident_user_id", userId),
      db.from("portal_resident_lease_upload_records").delete().eq("resident_user_id", userId),
      db.from("portal_bug_feedback_records").delete().eq("reporter_user_id", userId),
    );
  }

  if (applicationId) {
    deleteOps.push(
      db.from("manager_application_records").delete().eq("id", applicationId),
      db.from("portal_household_charge_records").delete().filter("row_data->>applicationId", "eq", applicationId),
      db.from("portal_lease_pipeline_records").delete().filter("row_data->>axisId", "eq", applicationId),
    );
  }

  if (deleteOps.length === 0) return;
  assertNoDeleteErrors(await Promise.all(deleteOps));
}

/** Remove properties, resident records, payments, leases, and other portal rows for a manager. */
export async function purgeManagerPortalData(db: ServiceDb, managerUserId: string): Promise<void> {
  if (!managerUserId) return;

  const results = await Promise.all([
    db.from("manager_property_records").delete().eq("manager_user_id", managerUserId),
    db.from("manager_application_records").delete().eq("manager_user_id", managerUserId),
    db.from("portal_household_charge_records").delete().eq("manager_user_id", managerUserId),
    db.from("portal_recurring_rent_profile_records").delete().eq("manager_user_id", managerUserId),
    db.from("portal_lease_pipeline_records").delete().eq("manager_user_id", managerUserId),
    db.from("portal_work_order_records").delete().eq("manager_user_id", managerUserId),
    db.from("portal_inbox_thread_records").delete().eq("owner_user_id", managerUserId),
    db.from("portal_schedule_records").delete().eq("manager_user_id", managerUserId),
    db.from("portal_pro_relationship_records").delete().eq("manager_user_id", managerUserId),
    db.from("portal_pro_relationship_records").delete().eq("related_user_id", managerUserId),
    db.from("account_link_invites").delete().eq("inviter_user_id", managerUserId),
    db.from("account_link_invites").delete().eq("invitee_user_id", managerUserId),
    db.from("portal_bug_feedback_records").delete().eq("reporter_user_id", managerUserId),
    db.from("manager_purchases").delete().eq("user_id", managerUserId),
  ]);

  assertNoDeleteErrors(results);
}
