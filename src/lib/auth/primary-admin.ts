/**
 * Primary Axis admin (ops) identity — keep in sync with scripts/ensure-admin-account.mjs.
 * Admin access itself is role-based (any `admin`-role account; see admin-role.ts);
 * this email is an always-admin fallback and the self-registration/provisioning gate.
 */
export const PRIMARY_ADMIN_EMAIL = "prakritramachandran@gmail.com";

export function normalizeAdminEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

export function isPrimaryAdminEmail(email: string | null | undefined): boolean {
  return normalizeAdminEmail(email) === PRIMARY_ADMIN_EMAIL;
}
