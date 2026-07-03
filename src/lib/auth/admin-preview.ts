import { cookies } from "next/headers";
import { cache } from "react";
import { userHoldsAdminRole } from "@/lib/auth/admin-role";
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

/**
 * Data-API admin gate. Any account holding the `admin` role qualifies (same
 * rule as the /admin portal shell — see `hasAdminRole` in portal-access.ts);
 * the primary-admin email stays admin as a fallback via `userHoldsAdminRole`.
 */
export const isAdminUser = cache(async (userId: string): Promise<boolean> => {
  const supabase = await createSupabaseServerClient();
  return userHoldsAdminRole(supabase, userId);
});
