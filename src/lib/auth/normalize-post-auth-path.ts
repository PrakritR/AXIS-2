import { portalDashboardPath, type AuthRole } from "@/lib/auth/portal-roles";

/** Legacy / misconfigured Supabase site URLs sometimes land on bare /dashboard. */
export function isBareDashboardPath(path: string): boolean {
  const p = path.trim();
  return p === "/dashboard" || p === "dashboard";
}

/** Ensure post-auth redirects always use a real portal route. */
export function normalizePostAuthPath(path: string, role?: AuthRole): string {
  const trimmed = path.trim();
  if (!trimmed || isBareDashboardPath(trimmed)) {
    return role ? portalDashboardPath(role) : "/auth/continue";
  }
  if (!trimmed.startsWith("/")) return "/auth/continue";
  return trimmed;
}
