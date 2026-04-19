import { cookies } from "next/headers";
import type { PreviewPortal } from "@/lib/auth/preview-types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type { PreviewPortal } from "@/lib/auth/preview-types";

export const PREVIEW_UID_COOKIE = "axis_admin_preview_uid";
export const PREVIEW_PORTAL_COOKIE = "axis_admin_preview_portal";

export async function getAdminPreviewFromCookies(): Promise<{ targetUserId: string; portal: PreviewPortal } | null> {
  const c = await cookies();
  const uid = c.get(PREVIEW_UID_COOKIE)?.value?.trim();
  const portalRaw = c.get(PREVIEW_PORTAL_COOKIE)?.value?.trim();
  const portal = portalRaw as PreviewPortal | undefined;
  if (!uid || !portal) return null;
  if (portal !== "manager" && portal !== "resident" && portal !== "owner") return null;
  return { targetUserId: uid, portal };
}

export async function isAdminUser(userId: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  return data?.role === "admin";
}
