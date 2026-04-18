function normalizeEmailList(raw: string | undefined) {
  return raw
    ?.split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean) ?? [];
}

/**
 * Full resident workspace (lease, payments, work orders, inbox) when approved in DB,
 * or when the account matches dev/test allowlists (see env vars below).
 */
export function residentHasFullPortalAccess(params: {
  applicationApproved: boolean;
  role: string | null | undefined;
  email: string | null | undefined;
}): boolean {
  if (params.applicationApproved) return true;
  if (params.role && params.role !== "resident") return false;

  if (
    process.env.NODE_ENV === "development" &&
    process.env.RESIDENT_PORTAL_DEV_FULL_ACCESS === "1" &&
    params.role === "resident"
  ) {
    return true;
  }

  const email = (params.email ?? "").trim().toLowerCase();
  if (!email) return false;

  const allowList = normalizeEmailList(process.env.RESIDENT_PORTAL_FULL_ACCESS_EMAILS);
  if (allowList.length > 0 && allowList.includes(email)) return true;

  const domain = process.env.RESIDENT_PORTAL_TEST_EMAIL_DOMAIN?.trim().toLowerCase();
  if (domain && email.endsWith(domain)) return true;

  return false;
}
