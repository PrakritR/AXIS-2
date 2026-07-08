import { isAdminUser } from "@/lib/auth/admin-preview";
import { getPortalAccessContext, hasRole } from "@/lib/auth/portal-access";
import type { AuthRole } from "@/lib/auth/portal-roles";

export type VendorApiActor = {
  userId: string;
  email: string;
  fullName: string;
  admin: boolean;
  roles: AuthRole[];
  effectiveRole: AuthRole | null;
};

/** Vendor API routes must allow multi-role users (profile_roles), not only profiles.role. */
export async function requireVendorApiAccess(): Promise<
  | { ok: true; actor: VendorApiActor }
  | { ok: false; status: 401 | 403 }
> {
  const ctx = await getPortalAccessContext();
  if (!ctx.user) return { ok: false, status: 401 };
  if (!hasRole(ctx, "vendor")) return { ok: false, status: 403 };

  const admin = await isAdminUser(ctx.user.id);
  return {
    ok: true,
    actor: {
      userId: ctx.user.id,
      email: (ctx.profile?.email ?? ctx.user.email ?? "").trim().toLowerCase(),
      fullName: ctx.profile?.full_name?.trim() ?? "",
      admin,
      roles: ctx.roles,
      effectiveRole: ctx.effectiveRole,
    },
  };
}

/** Role used for mixed manager/vendor API routes (e.g. work-order bids). */
export function resolvePortalApiActorRole(
  ctx: Pick<Awaited<ReturnType<typeof getPortalAccessContext>>, "effectiveRole" | "roles" | "profile">,
): string {
  if (ctx.effectiveRole) return ctx.effectiveRole;
  if (ctx.roles.length === 1) return ctx.roles[0]!;
  return String(ctx.profile?.role ?? "").toLowerCase();
}
