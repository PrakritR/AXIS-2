/** Paths reachable while the resident has not submitted an application yet. */
export function isResidentPreApplicationAllowedPath(pathname: string): boolean {
  if (pathname === "/resident/applications") return true;
  if (pathname.startsWith("/resident/applications/")) return true;
  return false;
}
