import type { AuthRole } from "@/components/auth/portal-switcher";

/**
 * Development routing: local part `role` or `anything+role` before @ selects the portal until full auth wiring.
 * Examples: admin@…, you+manager@gmail.com, owner@….
 */
export function resolvePortalRoleFromEmail(email: string): AuthRole {
  const e = email.trim().toLowerCase();
  const at = e.lastIndexOf("@");
  const local = at > 0 ? e.slice(0, at) : e;
  if (!local) return "resident";

  const ordered: AuthRole[] = ["admin", "owner", "manager", "resident"];
  for (const role of ordered) {
    if (local === role || local.endsWith(`+${role}`)) return role;
  }
  return "resident";
}

/** Expected key when creating the primary admin account. Override with NEXT_PUBLIC_AXIS_ADMIN_REGISTER_KEY. */
export function isValidAdminRegisterKey(key: string): boolean {
  const expected = process.env.NEXT_PUBLIC_AXIS_ADMIN_REGISTER_KEY ?? "prakrit-admin-register";
  return key.trim() === expected;
}
