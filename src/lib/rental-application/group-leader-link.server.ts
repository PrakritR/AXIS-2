import type { SupabaseClient } from "@supabase/supabase-js";
import type { DemoApplicantRow } from "@/data/demo-portal";
import {
  assessGroupLeaderApplication,
  type GroupLeaderLinkPreview,
  validateGroupLeaderAppIdInput,
} from "@/lib/rental-application/group-leader-link";

function rowFromRecord(record: { id: string; row_data: unknown } | null): Pick<
  DemoApplicantRow,
  "id" | "application" | "name"
> | null {
  if (!record?.row_data) return null;
  const row = record.row_data as DemoApplicantRow;
  return {
    id: record.id,
    name: row.name,
    application: row.application,
  };
}

export async function loadGroupLeaderLinkPreview(
  db: SupabaseClient,
  leaderAppId: string,
): Promise<GroupLeaderLinkPreview> {
  const validated = validateGroupLeaderAppIdInput(leaderAppId);
  if (!validated.ok) {
    return { ok: false, code: "invalid_id", message: validated.message };
  }

  const { data, error } = await db
    .from("manager_application_records")
    .select("id, row_data")
    .eq("id", validated.normalized)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      code: "not_found",
      message: "Could not look up that application right now. Try again in a moment.",
    };
  }

  if (!data) {
    return assessGroupLeaderApplication(validated.normalized, null);
  }

  return assessGroupLeaderApplication(validated.normalized, rowFromRecord(data));
}
