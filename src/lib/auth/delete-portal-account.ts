import { findAuthUserIdByEmail } from "@/lib/auth/find-auth-user-id-by-email";
import { purgeManagerPortalData, purgeResidentPortalData } from "@/lib/auth/purge-portal-account-data";
import { removePortalAccess, type PortalRole } from "@/lib/auth/remove-portal-access";
import type { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

type ServiceDb = ReturnType<typeof createSupabaseServiceRoleClient>;

const PROTECTED_ROLES = new Set(["admin", "manager", "pro"]);

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

async function profileEmail(db: ServiceDb, userId: string): Promise<string> {
  const { data } = await db.from("profiles").select("email").eq("id", userId).maybeSingle();
  return normalizeEmail(data?.email);
}

async function normalizedRolesForEmail(db: ServiceDb, email: string): Promise<string[] | null> {
  const targetUserId = await findAuthUserIdByEmail(db, email);
  if (!targetUserId) return null;

  const [{ data: profile }, { data: roleRows }] = await Promise.all([
    db.from("profiles").select("id, role").eq("id", targetUserId).maybeSingle(),
    db.from("profile_roles").select("role").eq("user_id", targetUserId),
  ]);

  const normalizedRoles = (roleRows ?? [])
    .map((row) => String(row.role ?? "").toLowerCase())
    .filter(Boolean);
  const legacyRole = String(profile?.role ?? "").toLowerCase();
  if (legacyRole && !normalizedRoles.includes(legacyRole)) normalizedRoles.push(legacyRole);
  return normalizedRoles;
}

/** Returns whether resident portal data can be purged without violating protected-role policy. */
export async function canHardDeleteResident(db: ServiceDb, email: string) {
  const normalizedRoles = await normalizedRolesForEmail(db, email);
  if (normalizedRoles === null) return { ok: true as const };
  if (normalizedRoles.some((role) => PROTECTED_ROLES.has(role))) {
    return { ok: false as const, error: "Target user has non-resident portal roles and cannot be hard-deleted." };
  }
  return { ok: true as const };
}

/** Hard-delete resident login when they have no protected roles. */
export async function deleteResidentAuthUser(db: ServiceDb, email: string) {
  const targetUserId = await findAuthUserIdByEmail(db, email);
  if (!targetUserId) {
    return { ok: true as const, mode: "no_auth_user" as const };
  }

  const guard = await canHardDeleteResident(db, email);
  if (!guard.ok) return guard;

  await db.from("profile_roles").delete().eq("user_id", targetUserId);
  await db.from("profiles").delete().eq("id", targetUserId);

  const { error: authDeleteError } = await db.auth.admin.deleteUser(targetUserId);
  if (authDeleteError) throw new Error(authDeleteError.message);
  return { ok: true as const, mode: "deleted_auth_user" as const };
}

/** Cascade-delete resident child data, then remove resident portal access / auth user. */
export async function deleteResidentAccount(
  db: ServiceDb,
  input: { userId?: string; email?: string; applicationId?: string; purgeData?: boolean },
) {
  const userId = typeof input.userId === "string" ? input.userId.trim() : "";
  const email = normalizeEmail(input.email) || (userId ? await profileEmail(db, userId) : "");
  const applicationId = typeof input.applicationId === "string" ? input.applicationId.trim() : "";
  const purgeData = input.purgeData !== false;
  const hasTarget = Boolean(userId || email || applicationId);

  if (purgeData && email) {
    const canHardDelete = await canHardDeleteResident(db, email);
    if (!canHardDelete.ok) return canHardDelete;
  }

  if (purgeData) {
    await purgeResidentPortalData(db, { email, userId: userId || null, applicationId: applicationId || null });
  }

  if (!hasTarget) {
    return { ok: true as const, mode: "no_target" as const };
  }

  if (!userId && !email) {
    return { ok: true as const, mode: "purged_data_only" as const };
  }

  if (purgeData && email) {
    const loginDeleteResult = await deleteResidentAuthUser(db, email);
    if (!loginDeleteResult.ok) {
      return { ok: false as const, error: loginDeleteResult.error };
    }
    return { ok: true as const, mode: "purged" as const, loginMode: loginDeleteResult.mode };
  }

  const targetUserId = userId || (email ? await findAuthUserIdByEmail(db, email) : null);
  if (!targetUserId) {
    return { ok: true as const, mode: "no_auth_user" as const };
  }

  const result = await removePortalAccess(db, targetUserId, "resident");
  return { ok: true as const, mode: result.mode };
}

/** Admin-only: purge all portal data and remove the auth user entirely. */
export async function deletePortalAccountCompletely(db: ServiceDb, userId: string) {
  const trimmedId = userId.trim();
  if (!trimmedId) {
    throw new Error("User id is required.");
  }

  const email = await profileEmail(db, trimmedId);
  await purgeManagerPortalData(db, trimmedId);
  await purgeResidentPortalData(db, { email, userId: trimmedId });

  const { error: rolesErr } = await db.from("profile_roles").delete().eq("user_id", trimmedId);
  if (rolesErr) throw new Error(rolesErr.message);

  const { error: profileErr } = await db.from("profiles").delete().eq("id", trimmedId);
  if (profileErr) throw new Error(profileErr.message);

  const { error: authDeleteError } = await db.auth.admin.deleteUser(trimmedId);
  if (authDeleteError) throw new Error(authDeleteError.message);

  return { ok: true as const, mode: "deleted_auth_user" as const };
}

/** Cascade-delete manager properties, payments, leases, etc., then remove manager access / auth user. */
export async function deleteManagerAccount(db: ServiceDb, managerUserId: string) {
  await purgeManagerPortalData(db, managerUserId);
  const result = await removePortalAccess(db, managerUserId, "manager");
  return { ok: true as const, mode: result.mode };
}

export type { PortalRole };
