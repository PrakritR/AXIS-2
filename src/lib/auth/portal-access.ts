import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { portalDashboardPath, type AuthRole } from "@/components/auth/portal-switcher";
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
  return value === "resident" || value === "manager" || value === "owner" || value === "admin";
}

function normalizeRoles(rows: { role: string }[] | null | undefined, fallback: AuthRole | null): AuthRole[] {
  const fromTable = (rows ?? [])
    .map((r) => r.role)
    .filter((r): r is AuthRole => isAuthRole(r));
  const unique = [...new Set(fromTable)];
  if (unique.length > 0) return unique;
  if (fallback && isAuthRole(fallback)) return [fallback];
  return ["resident"];
}

/**
 * Roles from profile_roles (or legacy profiles.role), plus which portal is active via cookie when multi-role.
 */
export async function getPortalAccessContext(): Promise<PortalAccessContext> {
  const base = await getServerSessionProfile();
  if (!base.user) {
    return { user: null, profile: null, roles: [], effectiveRole: null };
  }

  const supabase = await createSupabaseServerClient();
  const { data: roleRows, error: roleErr } = await supabase.from("profile_roles").select("role").eq("user_id", base.user.id);

  const fallback = base.profile?.role ? (base.profile.role as AuthRole) : null;
  const roles = roleErr ? normalizeRoles(null, fallback) : normalizeRoles(roleRows, fallback);

  const c = await cookies();
  const cookieRaw = c.get(ACTIVE_PORTAL_COOKIE)?.value?.trim() ?? "";
  const cookieRole = isAuthRole(cookieRaw) ? cookieRaw : null;

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
}

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
  if (ctx.roles.length > 1 && ctx.effectiveRole === null) {
    redirect(`/auth/choose-portal?next=${encodeURIComponent("/admin/dashboard")}`);
  }
  if (ctx.effectiveRole !== "admin") {
    redirect(portalDashboardPath(ctx.effectiveRole ?? "resident"));
  }
}
