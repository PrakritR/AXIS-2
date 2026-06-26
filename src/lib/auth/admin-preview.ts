import { cookies } from "next/headers";
import { cache } from "react";
import { isPrimaryAdminEmail } from "@/lib/auth/primary-admin";
import type { PreviewPortal } from "@/lib/auth/preview-types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type { PreviewPortal } from "@/lib/auth/preview-types";

export const PREVIEW_UID_COOKIE = "axis_admin_preview_uid";
export const PREVIEW_PORTAL_COOKIE = "axis_admin_preview_portal";

export const getAdminPreviewFromCookies = cache(async (): Promise<{ targetUserId: string; portal: PreviewPortal } | null> => {
  const c = await cookies();
  const uid = c.get(PREVIEW_UID_COOKIE)?.value?.trim();
  const portalRaw = c.get(PREVIEW_PORTAL_COOKIE)?.value?.trim();
  const portal = portalRaw as PreviewPortal | undefined;
  if (!uid || !portal) return null;
  if (portal !== "manager" && portal !== "resident") return null;
  return { targetUserId: uid, portal };
});

export const isAdminUser = cache(async (userId: string): Promise<boolean> => {
  const supabase = await createSupabaseServerClient();
  const { data: profile } = await supabase.from("profiles").select("email, role").eq("id", userId).maybeSingle();
  if (!isPrimaryAdminEmail(profile?.email)) return false;

  const { data: pr, error: prErr } = await supabase
    .from("profile_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!prErr && pr) return true;
  return profile?.role === "admin";
});
