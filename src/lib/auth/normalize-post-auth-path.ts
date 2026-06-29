import { portalDashboardPath, type AuthRole } from "@/lib/auth/portal-roles";

/** Legacy / misconfigured Supabase site URLs sometimes land on bare /dashboard. */
export function isBareDashboardPath(path: string): boolean {
  const p = path.trim();
  return p === "/dashboard" || p === "dashboard";
}

function pathMatchesRole(path: string, role: AuthRole): boolean {
  if (role === "manager") return path.startsWith("/portal") || path.startsWith("/pro");
  if (role === "resident") return path.startsWith("/resident");
  if (role === "admin") return path.startsWith("/admin");
  return false;
}

/** Ensure post-auth redirects always use a real portal route. */
export function normalizePostAuthPath(path: string, role?: AuthRole): string {
  const trimmed = path.trim();
  if (!trimmed || isBareDashboardPath(trimmed)) {
    return role ? portalDashboardPath(role) : "/auth/continue";
  }
  if (!trimmed.startsWith("/")) return "/auth/continue";
  if (role && !pathMatchesRole(trimmed, role)) {
    return portalDashboardPath(role);
  }
  return trimmed;
}
