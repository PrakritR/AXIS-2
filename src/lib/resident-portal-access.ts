/**
 * Full resident workspace (lease, payments, work orders, inbox) is available
 * only after the resident application is approved.
 */
export function residentHasFullPortalAccess(params: {
  applicationApproved: boolean;
  role: string | null | undefined;
  email: string | null | undefined;
}): boolean {
  if (params.role && params.role !== "resident") return false;
  return params.applicationApproved;
}
