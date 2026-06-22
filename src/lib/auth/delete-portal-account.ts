import { findAuthUserIdByEmail } from "@/lib/auth/find-auth-user-id-by-email";
import { purgeManagerPortalData, purgeResidentPortalData } from "@/lib/auth/purge-portal-account-data";
import { removePortalAccess, type PortalRole } from "@/lib/auth/remove-portal-access";
import type { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

type ServiceDb = ReturnType<typeof createSupabaseServiceRoleClient>;

const PROTECTED_ROLES = new Set(["admin", "manager", "owner", "pro"]);

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

async function profileEmail(db: ServiceDb, userId: string): Promise<string> {
  const { data } = await db.from("profiles").select("email").eq("id", userId).maybeSingle();
  return normalizeEmail(data?.email);
}

/** Hard-delete resident login when they have no protected roles. */
export async function deleteResidentAuthUser(db: ServiceDb, email: string) {
  const targetUserId = await findAuthUserIdByEmail(db, email);
  if (!targetUserId) {
    return { ok: true as const, mode: "no_auth_user" as const };
  }

  const [{ data: profile }, { data: roleRows }] = await Promise.all([
    db.from("profiles").select("id, role").eq("id", targetUserId).maybeSingle(),
    db.from("profile_roles").select("role").eq("user_id", targetUserId),
  ]);

  const normalizedRoles = (roleRows ?? [])
    .map((row) => String(row.role ?? "").toLowerCase())
    .filter(Boolean);
  const legacyRole = String(profile?.role ?? "").toLowerCase();
  if (legacyRole && !normalizedRoles.includes(legacyRole)) normalizedRoles.push(legacyRole);

  if (normalizedRoles.some((role) => PROTECTED_ROLES.has(role))) {
    return { ok: false as const, error: "Target user has non-resident portal roles and cannot be hard-deleted." };
  }

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

  if (purgeData) {
    await purgeResidentPortalData(db, { email, userId: userId || null, applicationId: applicationId || null });
  }

  if (!userId && !email) {
    return { ok: true as const, mode: "no_target" as const };
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

/** Cascade-delete manager properties, payments, leases, etc., then remove manager access / auth user. */
export async function deleteManagerAccount(db: ServiceDb, managerUserId: string) {
  await purgeManagerPortalData(db, managerUserId);
  const result = await removePortalAccess(db, managerUserId, "manager");
  return { ok: true as const, mode: result.mode };
}

export type { PortalRole };
