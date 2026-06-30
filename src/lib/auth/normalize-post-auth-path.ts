import { portalDashboardPath, type AuthRole } from "@/lib/auth/portal-roles";

/** Legacy / misconfigured Supabase site URLs sometimes land on bare /dashboard. */
export function isBareDashboardPath(path: string): boolean {
  const p = path.trim();
  return p === "/dashboard" || p === "dashboard";
}

/** Protocol-relative, scheme, or backslash paths must never be used as post-auth redirects. */
export function isUnsafeRedirectPath(path: string): boolean {
  const trimmed = path.trim();
  if (!trimmed) return true;
  if (!trimmed.startsWith("/")) return true;
  if (trimmed.startsWith("//")) return true;
  if (trimmed.startsWith("/\\")) return true;
  if (/^\/https?:/i.test(trimmed)) return true;
  if (trimmed.includes("\\")) return true;

  if (/%2f/i.test(trimmed) || /%5c/i.test(trimmed)) {
    try {
      const decoded = decodeURIComponent(trimmed);
      if (decoded !== trimmed) return isUnsafeRedirectPath(decoded);
    } catch {
      return true;
    }
  }

  return false;
}

function pathMatchesRole(path: string, role: AuthRole): boolean {
  if (role === "manager") return path.startsWith("/portal") || path.startsWith("/pro");
  if (role === "resident") return path.startsWith("/resident");
  if (role === "admin") return path.startsWith("/admin");
  return false;
}

function defaultPostAuthPath(role?: AuthRole): string {
  return role ? portalDashboardPath(role) : "/auth/continue";
}

/** Route through /auth/continue when portal access could not be resolved server-side. */
export function failClosedOAuthContinuePath(next: string): string {
  const safe = normalizePostAuthPath(next);
  if (safe === "/auth/continue") return "/auth/continue";
  return `/auth/continue?next=${encodeURIComponent(safe)}`;
}

/** Ensure post-auth redirects always use a safe same-origin portal route. */
export function normalizePostAuthPath(path: string, role?: AuthRole): string {
  const trimmed = path.trim();
  if (!trimmed || isBareDashboardPath(trimmed) || isUnsafeRedirectPath(trimmed)) {
    return defaultPostAuthPath(role);
  }
  if (!trimmed.startsWith("/")) return defaultPostAuthPath(role);
  if (role && !pathMatchesRole(trimmed, role)) {
    return portalDashboardPath(role);
  }
  return trimmed;
}
