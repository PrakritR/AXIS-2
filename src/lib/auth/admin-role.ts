import type { SupabaseClient } from "@supabase/supabase-js";
import { isPrimaryAdminEmail, PRIMARY_ADMIN_EMAIL } from "@/lib/auth/primary-admin";

/**
 * Single source of truth for "is this account an Axis admin", shared by the
 * admin data-API gate (`isAdminUser` in admin-preview.ts) and role-aware
 * public routes. Matches the portal-shell rule (`hasAdminRole` in
 * portal-access.ts): an admin is any account holding the `admin` role via
 * `profile_roles`, or the legacy `profiles.role = 'admin'`. The primary-admin
 * email remains an always-admin fallback so the ops account can never lock
 * itself out.
 */
export async function filterAdminUserIds(db: SupabaseClient, userIds: string[]): Promise<Set<string>> {
  const admins = new Set<string>();
  const ids = [...new Set(userIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return admins;

  const [roleRes, profileRes] = await Promise.all([
    db.from("profile_roles").select("user_id").eq("role", "admin").in("user_id", ids),
    db.from("profiles").select("id, email, role").in("id", ids),
  ]);

  for (const row of (roleRes.data ?? []) as { user_id?: string | null }[]) {
    const id = String(row.user_id ?? "").trim();
    if (id) admins.add(id);
  }
  for (const row of (profileRes.data ?? []) as { id?: string | null; email?: string | null; role?: string | null }[]) {
    const id = String(row.id ?? "").trim();
    if (!id) continue;
    if (String(row.role ?? "").trim().toLowerCase() === "admin" || isPrimaryAdminEmail(row.email)) {
      admins.add(id);
    }
  }
  return admins;
}

/** Whether one account holds the `admin` role (or is the primary-admin email). */
export async function userHoldsAdminRole(db: SupabaseClient, userId: string): Promise<boolean> {
  const id = userId.trim();
  if (!id) return false;
  const admins = await filterAdminUserIds(db, [id]);
  return admins.has(id);
}

/**
 * All user ids currently holding the `admin` role, resolved by the same rule as
 * `filterAdminUserIds` (`profile_roles`, legacy `profiles.role`, or the
 * primary-admin email), returned sorted for deterministic consumers.
 */
export async function listAdminUserIds(db: SupabaseClient): Promise<string[]> {
  const [roleRes, legacyRes, primaryRes] = await Promise.all([
    db.from("profile_roles").select("user_id").eq("role", "admin"),
    db.from("profiles").select("id").ilike("role", "admin"),
    db.from("profiles").select("id").ilike("email", PRIMARY_ADMIN_EMAIL),
  ]);

  const admins = new Set<string>();
  for (const row of (roleRes.data ?? []) as { user_id?: string | null }[]) {
    const id = String(row.user_id ?? "").trim();
    if (id) admins.add(id);
  }
  for (const row of [...(legacyRes.data ?? []), ...(primaryRes.data ?? [])] as { id?: string | null }[]) {
    const id = String(row.id ?? "").trim();
    if (id) admins.add(id);
  }
  return [...admins].sort();
}
