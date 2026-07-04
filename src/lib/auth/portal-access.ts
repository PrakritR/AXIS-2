import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { AuthRole } from "@/components/auth/portal-switcher";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getServerSessionProfile, type ServerProfile } from "@/lib/auth/server-profile";

export const ACTIVE_PORTAL_COOKIE = "axis_active_portal";

export type PortalAccessContext = {
  user: { id: string; email?: string | null } | null;
  profile: ServerProfile | null;
  roles: AuthRole[];
  effectiveRole: AuthRole | null;
};

function isAuthRole(value: string): value is AuthRole {
  return value === "resident" || value === "manager" || value === "admin" || value === "vendor";
}

function mapLegacyPortalRole(role: string | null | undefined): AuthRole | null {
  const value = String(role ?? "").toLowerCase();
  if (value === "owner") return "manager";
  return isAuthRole(value) ? value : null;
}

function normalizeRoles(rows: { role: string }[] | null | undefined, fallbackRole: string | null | undefined): AuthRole[] {
  const fromTable = (rows ?? [])
    .map((r) => (r.role === "owner" ? "manager" : r.role))
    .filter((r): r is AuthRole => isAuthRole(r));
  const unique = [...new Set(fromTable)];
  if (unique.length > 0) return unique;
  const mappedFallback = mapLegacyPortalRole(fallbackRole);
  if (mappedFallback) return [mappedFallback];
  return [];
}

/**
 * Roles from profile_roles (or legacy profiles.role), plus which portal is active via cookie when multi-role.
 */
export const getPortalAccessContext = cache(async (): Promise<PortalAccessContext> => {
  const base = await getServerSessionProfile();
  if (!base.user) {
    return { user: null, profile: null, roles: [], effectiveRole: null };
  }

  const fallbackRole = base.profile?.role ?? null;

  let roles: AuthRole[];
  try {
    const supabase = await createSupabaseServerClient();
    const { data: roleRows, error: roleErr } = await supabase.from("profile_roles").select("role").eq("user_id", base.user.id);
    roles = roleErr ? normalizeRoles(null, fallbackRole) : normalizeRoles(roleRows, fallbackRole);
  } catch {
    roles = normalizeRoles(null, fallbackRole);
  }

  let cookieRole: AuthRole | null = null;
  try {
    const c = await cookies();
    const cookieRaw = c.get(ACTIVE_PORTAL_COOKIE)?.value?.trim() ?? "";
    cookieRole = isAuthRole(cookieRaw) ? cookieRaw : null;
  } catch {
    cookieRole = null;
  }

  let effectiveRole: AuthRole | null;
  if (roles.length === 1) {
    effectiveRole = roles[0]!;
  } else {
    effectiveRole = cookieRole && roles.includes(cookieRole) ? cookieRole : null;
  }

  return {
    user: base.user,
    profile: base.profile,
    roles,
    effectiveRole,
  };
});

export function hasRole(ctx: PortalAccessContext, role: AuthRole): boolean {
  return ctx.roles.includes(role);
}

export function hasAdminRole(ctx: PortalAccessContext): boolean {
  return hasRole(ctx, "admin");
}

export async function assertAdminPortalAccess() {
  const ctx = await getPortalAccessContext();
  if (!ctx.user) redirect("/auth/sign-in");
  if (!hasAdminRole(ctx)) redirect("/auth/sign-in");
  /** Admin routes use profile_roles admin membership only. Do not require `axis_active_portal=admin`:
   *  multi-role admin+manager users otherwise bounce /admin → /pro → /admin when preview cookies are unset. */
}
