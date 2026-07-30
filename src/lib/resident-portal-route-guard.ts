/** Paths reachable while the resident is still in the application phase (before lease approval). */
export function isResidentApplicationPhaseAllowedPath(
  pathname: string,
  options?: { allowDashboard?: boolean },
): boolean {
  if (options?.allowDashboard && pathname === "/resident/dashboard") return true;
  if (pathname === "/resident/applications") return true;
  if (pathname.startsWith("/resident/applications/")) return true;
  if (pathname === "/resident/profile") return true;
  if (pathname.startsWith("/resident/profile/")) return true;
  return false;
}

/** Paths reachable during pre-lease (tour booked or application submitted, not yet approved). */
export function isResidentPreLeaseAllowedPath(pathname: string): boolean {
  if (pathname === "/resident/dashboard") return true;
  if (pathname === "/resident/tour") return true;
  if (pathname.startsWith("/resident/tour/")) return true;
  if (pathname === "/resident/applications") return true;
  if (pathname.startsWith("/resident/applications/")) return true;
  if (pathname === "/resident/communication") return true;
  if (pathname.startsWith("/resident/communication/")) return true;
  if (pathname === "/resident/profile") return true;
  if (pathname.startsWith("/resident/profile/")) return true;
  return false;
}

/** @deprecated Use isResidentApplicationPhaseAllowedPath */
export function isResidentPreApplicationAllowedPath(pathname: string): boolean {
  return isResidentApplicationPhaseAllowedPath(pathname);
}
