import { ensureProfileRoleRow } from "@/lib/auth/profile-role-row";
import { isPrimaryAdminEmail } from "@/lib/auth/primary-admin";
import type { SupabaseClient, User } from "@supabase/supabase-js";

function oauthFullName(user: User): string | null {
  const meta = user.user_metadata ?? {};
  const fullName = typeof meta.full_name === "string" ? meta.full_name.trim() : "";
  if (fullName) return fullName;
  const name = typeof meta.name === "string" ? meta.name.trim() : "";
  return name || null;
}

/** Ensures profiles/profile_roles reflect an OAuth sign-in for known Axis accounts. */
export async function syncOAuthProfile(supabase: SupabaseClient, user: User): Promise<void> {
  const email = user.email?.trim().toLowerCase() ?? "";
  if (!email) return;

  const fullName = oauthFullName(user);
  const { data: existing } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();

  if (existing) {
    const patch: { email: string; full_name?: string } = { email };
    if (!existing.full_name?.trim() && fullName) patch.full_name = fullName;
    const { error } = await supabase.from("profiles").update(patch).eq("id", user.id);
    if (error) throw error;
    return;
  }

  if (!isPrimaryAdminEmail(email)) return;

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
  await ensureProfileRoleRow(supabase, user.id, "manager");
}
