/** Maps legacy /manager, /owner, /pro paths to canonical /portal paths. */
export function legacyPaidPortalToPortal(pathname: string): string | null {
  if (pathname === "/portal/work-orders" || pathname.startsWith("/portal/work-orders/")) {
    return "/portal/services/work-orders";
  }
  if (pathname === "/manager" || pathname === "/manager/") return "/portal/dashboard";
  if (pathname.startsWith("/manager/")) return `/portal${pathname.slice("/manager".length)}`;
  if (pathname === "/owner" || pathname === "/owner/") return "/portal/dashboard";
  if (pathname.startsWith("/owner/")) return `/portal${pathname.slice("/owner".length)}`;
  if (pathname === "/pro" || pathname === "/pro/") return "/portal/dashboard";
  if (pathname.startsWith("/pro/")) return `/portal${pathname.slice("/pro".length)}`;
  return null;
}
