/** Sole Axis admin identity — keep in sync with scripts/ensure-admin-account.mjs */
export const PRIMARY_ADMIN_EMAIL = "prakritramachandran@gmail.com";

export function normalizeAdminEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

export function isPrimaryAdminEmail(email: string | null | undefined): boolean {
  return normalizeAdminEmail(email) === PRIMARY_ADMIN_EMAIL;
}
