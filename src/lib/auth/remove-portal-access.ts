import type { SupabaseClient } from "@supabase/supabase-js";

export type PortalRole = "admin" | "owner" | "manager" | "resident" | "pro";

function nextPrimaryRole(roles: string[]): string | null {
  if (roles.includes("admin")) return "admin";
  if (roles.includes("owner")) return "owner";
  if (roles.includes("manager")) return "manager";
  if (roles.includes("pro")) return "pro";
  if (roles.includes("resident")) return "resident";
  return roles[0] ?? null;
}

export async function removePortalAccess(
  svc: SupabaseClient,
  userId: string,
  roleToRemove: PortalRole,
) {
  const { data: rolesRows, error: rolesErr } = await svc
    .from("profile_roles")
    .select("role")
    .eq("user_id", userId);
  if (rolesErr) throw new Error(rolesErr.message);

  const currentRoles = (rolesRows ?? [])
    .map((row) => String(row.role ?? "").toLowerCase())
    .filter(Boolean);

  if (!currentRoles.includes(roleToRemove)) {
    return { ok: true as const, mode: "no_role" as const };
  }

  const remainingRoles = currentRoles.filter((role) => role !== roleToRemove);

  if (remainingRoles.length === 0) {
    const { error: deleteErr } = await svc.auth.admin.deleteUser(userId);
    if (deleteErr) throw new Error(deleteErr.message);
    return { ok: true as const, mode: "deleted_auth_user" as const };
  }

  const { error: removeRoleErr } = await svc
    .from("profile_roles")
    .delete()
    .eq("user_id", userId)
    .eq("role", roleToRemove);
  if (removeRoleErr) throw new Error(removeRoleErr.message);

  const nextRole = nextPrimaryRole(remainingRoles);
  const profilePatch: Record<string, unknown> = {
    role: nextRole,
    updated_at: new Date().toISOString(),
  };
  if (roleToRemove === "resident") {
    profilePatch.application_approved = false;
  }

  const { error: updateErr } = await svc.from("profiles").update(profilePatch).eq("id", userId);
  if (updateErr) throw new Error(updateErr.message);

  return { ok: true as const, mode: "revoked_role" as const, remainingRoles };
}
