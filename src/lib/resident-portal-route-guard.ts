import type { ResidentPortalAccessState } from "@/lib/resident-portal-access-types";
import { isResidentPathAllowedForAccess } from "@/lib/resident-portal-nav";

/** @deprecated Use isResidentPathAllowedForAccess */
export function isResidentApplicationPhaseAllowedPath(
  pathname: string,
  options?: { allowDashboard?: boolean },
): boolean {
  if (options?.allowDashboard && pathname === "/resident/dashboard") return true;
  if (pathname === "/resident/applications") return true;
  if (pathname.startsWith("/resident/applications/")) return true;
  if (pathname === "/resident/tour" || pathname.startsWith("/resident/tour/")) return true;
  if (pathname === "/resident/dashboard") return true;
  if (pathname === "/resident/communication") return true;
  if (pathname.startsWith("/resident/communication/")) return true;
  if (pathname === "/resident/profile") return true;
  if (pathname.startsWith("/resident/profile/")) return true;
  return false;
}

/** @deprecated Use isResidentPathAllowedForAccess */
export function isResidentPreLeaseAllowedPath(pathname: string): boolean {
  if (pathname === "/resident/dashboard") return true;
  if (pathname === "/resident/tour") return true;
  if (pathname.startsWith("/resident/tour/")) return true;
  if (pathname === "/resident/applications") return true;
  if (pathname.startsWith("/resident/applications/")) return true;
  if (pathname === "/resident/lease") return true;
  if (pathname === "/resident/payments" || pathname.startsWith("/resident/payments/")) return true;
  if (pathname === "/resident/communication") return true;
  if (pathname.startsWith("/resident/communication/")) return true;
  if (pathname === "/resident/documents" || pathname.startsWith("/resident/documents/")) return true;
  if (pathname === "/resident/profile") return true;
  if (pathname.startsWith("/resident/profile/")) return true;
  return false;
}

/** @deprecated Use isResidentPathAllowedForAccess */
export function isResidentPreApplicationAllowedPath(pathname: string): boolean {
  return isResidentApplicationPhaseAllowedPath(pathname);
}

export function isResidentRouteAllowed(
  pathname: string,
  access: Pick<
    ResidentPortalAccessState,
    "leaseAccessUnlocked" | "applicationApproved" | "hasSubmittedApplication"
  >,
): boolean {
  return isResidentPathAllowedForAccess(pathname, access);
}
