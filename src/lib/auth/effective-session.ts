import { getAdminPreviewFromCookies, isAdminUser } from "@/lib/auth/admin-preview";
import type { PreviewPortal } from "@/lib/auth/preview-types";
import { getPortalAccessContext, hasAdminRole } from "@/lib/auth/portal-access";
import type { ServerProfile } from "@/lib/auth/server-profile";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

/**
 * Session + profile for the user whose portal is being viewed (real login or admin preview).
 */
export async function getEffectiveSessionForPortal(
  portal: PreviewPortal,
): Promise<{ user: { id: string; email?: string | null } | null; profile: ServerProfile | null }> {
  const ctx = await getPortalAccessContext();
  if (!ctx.user) return { user: null, profile: null };

  const preview = await getAdminPreviewFromCookies();
  if (hasAdminRole(ctx) && preview?.portal === portal) {
    const adminOk = await isAdminUser(ctx.user.id);
    if (!adminOk) return { user: ctx.user, profile: ctx.profile };

    const supabase = createSupabaseServiceRoleClient();
    const { data: profile } = await supabase.from("profiles").select("*").eq("id", preview.targetUserId).maybeSingle();
    if (!profile || profile.role !== portal) {
      return { user: ctx.user, profile: ctx.profile };
    }
    return {
      user: { id: profile.id, email: profile.email },
      profile: profile as ServerProfile,
    };
  }

  return { user: ctx.user, profile: ctx.profile };
}

export async function getEffectiveUserIdForPortal(portal: PreviewPortal): Promise<string | null> {
  const ctx = await getPortalAccessContext();
  if (!ctx.user) return null;

  const preview = await getAdminPreviewFromCookies();
  if (hasAdminRole(ctx) && (!preview || preview.portal !== portal)) {
    return null;
  }
  if (hasAdminRole(ctx) && preview?.portal === portal) {
    return preview.targetUserId;
  }

  return ctx.user.id;
}
