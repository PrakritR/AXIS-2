import { getAdminPreviewFromCookies, isAdminUser } from "@/lib/auth/admin-preview";
import type { PreviewPortal } from "@/lib/auth/preview-types";
import type { ServerProfile } from "@/lib/auth/server-profile";
import { getServerSessionProfile } from "@/lib/auth/server-profile";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

/**
 * Session + profile for the user whose portal is being viewed (real login or admin preview).
 */
export async function getEffectiveSessionForPortal(
  portal: PreviewPortal,
): Promise<{ user: { id: string; email?: string | null } | null; profile: ServerProfile | null }> {
  const base = await getServerSessionProfile();
  if (!base.user) return { user: null, profile: null };

  const preview = await getAdminPreviewFromCookies();
  if (base.profile?.role === "admin" && preview?.portal === portal) {
    const adminOk = await isAdminUser(base.user.id);
    if (!adminOk) return base;

    const supabase = createSupabaseServiceRoleClient();
    const { data: profile } = await supabase.from("profiles").select("*").eq("id", preview.targetUserId).maybeSingle();
    if (!profile || profile.role !== portal) {
      return base;
    }
    return {
      user: { id: profile.id, email: profile.email },
      profile: profile as ServerProfile,
    };
  }

  return base;
}

export async function getEffectiveUserIdForPortal(portal: PreviewPortal): Promise<string | null> {
  const { user, profile } = await getEffectiveSessionForPortal(portal);
  if (!user) return null;

  const preview = await getAdminPreviewFromCookies();
  if (profile?.role === "admin") {
    if (!preview || preview.portal !== portal) return null;
    return preview.targetUserId;
  }

  return user.id;
}
