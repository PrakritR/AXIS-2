import { findAuthUserIdByEmail } from "@/lib/auth/find-auth-user-id-by-email";
import { migratePortalUserId } from "@/lib/auth/migrate-portal-user-id";
import { primaryRoleWhenAddingResident } from "@/lib/auth/profile-primary-role";
import { ensureProfileRoleRow } from "@/lib/auth/profile-role-row";
import { normalizeE164 } from "@/lib/twilio";
import { generateAxisId } from "@/lib/manager-id";
import type { SupabaseClient } from "@supabase/supabase-js";

type ApplicationRow = {
  id: string;
  resident_email: string | null;
  row_data: unknown;
};

function applicationApproved(row: ApplicationRow): boolean {
  const rowData =
    row.row_data && typeof row.row_data === "object" && !Array.isArray(row.row_data)
      ? (row.row_data as Record<string, unknown>)
      : null;
  return String(rowData?.bucket ?? "").toLowerCase() === "approved";
}

function applicationPhone(row: ApplicationRow): string | null {
  const rowData =
    row.row_data && typeof row.row_data === "object" && !Array.isArray(row.row_data)
      ? (row.row_data as Record<string, unknown>)
      : null;
  const application =
    rowData?.application && typeof rowData.application === "object" && !Array.isArray(rowData.application)
      ? (rowData.application as Record<string, unknown>)
      : null;
  const raw = application?.phone ?? rowData?.phone;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function applicationName(row: ApplicationRow): string | null {
  const rowData =
    row.row_data && typeof row.row_data === "object" && !Array.isArray(row.row_data)
      ? (row.row_data as Record<string, unknown>)
      : null;
  return typeof rowData?.name === "string" ? rowData.name : null;
}

async function findApplicationByEmail(
  supabase: SupabaseClient,
  email: string,
): Promise<ApplicationRow | null> {
  const { data, error } = await supabase
    .from("manager_application_records")
    .select("id, resident_email, row_data")
    .eq("resident_email", email)
    .order("updated_at", { ascending: false })
    .limit(5);

  if (error) throw new Error(error.message);
  const rows = (data ?? []) as ApplicationRow[];
  if (rows.length === 0) return null;
  return rows.find((row) => applicationApproved(row)) ?? rows[0] ?? null;
}

export type ProvisionResidentResult =
  | { ok: true; axisId: string; linkedApplication: boolean }
  | { ok: false; status: number; error: string };

/** Resident signup without typing an Axis ID — links by email when an application exists. */
export async function provisionResidentAccountByEmail(
  supabase: SupabaseClient,
  opts: { userId: string; email: string; fullName?: string | null },
): Promise<ProvisionResidentResult> {
  const normalEmail = opts.email.trim().toLowerCase();
  if (!normalEmail.includes("@")) {
    return { ok: false, status: 400, error: "Enter a valid email address." };
  }

  const matchingApplication = await findApplicationByEmail(supabase, normalEmail);
  const linkedApplication = Boolean(matchingApplication);

  const existingAuthId = await findAuthUserIdByEmail(supabase, normalEmail);
  if (existingAuthId && existingAuthId !== opts.userId) {
    await migratePortalUserId(supabase, existingAuthId, opts.userId);
  }

  const { data: existingAuth } = await supabase.auth.admin.getUserById(opts.userId);
  const metadata = existingAuth.user?.user_metadata as Record<string, unknown> | undefined;
  const axisId = matchingApplication?.id ?? metadata?.axis_id?.toString() ?? generateAxisId();

  await supabase.auth.admin.updateUserById(opts.userId, {
    email_confirm: true,
    user_metadata: {
      ...(metadata ?? {}),
      role: "resident",
      axis_id: axisId,
      auto_provisioned_resident: !linkedApplication,
    },
  });

  const { data: existingProfile } = await supabase.from("profiles").select("*").eq("id", opts.userId).maybeSingle();
  const approved =
    (matchingApplication ? applicationApproved(matchingApplication) : false) ||
    Boolean(existingProfile?.application_approved);

  const { error: upErr } = await supabase.from("profiles").upsert(
    {
      id: opts.userId,
      email: normalEmail,
      role: primaryRoleWhenAddingResident(existingProfile?.role as string | undefined),
      full_name:
        opts.fullName?.trim() ||
        existingProfile?.full_name ||
        (matchingApplication ? applicationName(matchingApplication) : null),
      manager_id: existingProfile?.manager_id?.trim() || axisId,
      // Notifications text this number automatically — carry the phone the
      // resident gave on their rental application onto the profile.
      phone:
        (existingProfile?.phone as string | null)?.trim() ||
        (matchingApplication ? normalizeE164(applicationPhone(matchingApplication) ?? "") : null) ||
        null,
      application_approved: approved,
    },
    { onConflict: "id" },
  );
  if (upErr) {
    return { ok: false, status: 500, error: upErr.message };
  }

  await ensureProfileRoleRow(supabase, opts.userId, "resident");
  return { ok: true, axisId, linkedApplication };
}
