import { ensureProfileRoleRow } from "@/lib/auth/profile-role-row";
import { isPrimaryAdminEmail } from "@/lib/auth/primary-admin";
import { provisionFreeManagerFromOAuth } from "@/lib/auth/provision-free-manager-oauth";
import type { SupabaseClient, User } from "@supabase/supabase-js";

function oauthFullName(user: User): string | null {
  const meta = user.user_metadata ?? {};
  const fullName = typeof meta.full_name === "string" ? meta.full_name.trim() : "";
  if (fullName) return fullName;
  const name = typeof meta.name === "string" ? meta.name.trim() : "";
  return name || null;
}

export type SyncOAuthProfileOptions = {
  /** Skip auto free-manager provisioning (manager pricing / finish signup flows). */
  skipAutoProvision?: boolean;
};

/** Ensures profiles/profile_roles reflect an OAuth sign-in. */
export async function syncOAuthProfile(
  supabase: SupabaseClient,
  user: User,
  opts?: SyncOAuthProfileOptions,
): Promise<void> {
  const email = user.email?.trim().toLowerCase() ?? "";
  if (!email) return;

  const fullName = oauthFullName(user);
  // The ops admin is admin-ONLY. It must never be auto-provisioned a free
  // manager portal (its address is a Workspace/Gmail identity, so it would
  // otherwise match isGoogleOrGmailAccount and pick up a manager role on every
  // Google sign-in).
  const isPrimaryAdmin = isPrimaryAdminEmail(email);
  const { data: existing } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();

  if (existing) {
    const patch: { email: string; full_name?: string } = { email };
    if (!existing.full_name?.trim() && fullName) patch.full_name = fullName;
    const { error } = await supabase.from("profiles").update(patch).eq("id", user.id);
    if (error) throw error;
    if (isPrimaryAdmin) {
      // Re-assert admin so an OAuth sign-in always lands in the admin portal,
      // even if the role row was lost.
      await ensureProfileRoleRow(supabase, user.id, "admin");
      return;
    }
    if (!opts?.skipAutoProvision) {
      await provisionFreeManagerFromOAuth(supabase, user);
    }
    return;
  }

  if (isPrimaryAdmin) {
    const { error: profileError } = await supabase.from("profiles").upsert(
      {
        id: user.id,
        email,
        role: "admin",
        full_name: fullName,
        manager_id: null,
        application_approved: true,
      },
      { onConflict: "id" },
    );
    if (profileError) throw profileError;

    await ensureProfileRoleRow(supabase, user.id, "admin");
    return;
  }

  if (!opts?.skipAutoProvision) {
    await provisionFreeManagerFromOAuth(supabase, user);
  }
}
