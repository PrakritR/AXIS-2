import { redirect } from "next/navigation";
import { getAdminPreviewFromCookies } from "@/lib/auth/admin-preview";
import { getEffectiveUserIdForPortal } from "@/lib/auth/effective-session";
import { getServerSessionProfile } from "@/lib/auth/server-profile";
import { FREE_MANAGER_SECTIONS, getManagerSubscriptionTier } from "@/lib/manager-access";
import type { PortalDefinition } from "@/lib/portal-types";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { managerPortal } from "./manager";

export async function buildManagerPortalDefinition(): Promise<{
  definition: PortalDefinition;
  showUpgradeBanner: boolean;
  showPreviewBanner: boolean;
  previewLabel: string | null;
}> {
  const session = await getServerSessionProfile();
  if (!session.user) redirect("/auth/sign-in");

  if (session.profile?.role === "admin") {
    const preview = await getAdminPreviewFromCookies();
    if (!preview || preview.portal !== "manager") {
      redirect("/admin/dashboard");
    }
  } else if (session.profile?.role !== "manager") {
    redirect("/auth/sign-in");
  }

  const effectiveUserId = await getEffectiveUserIdForPortal("manager");
  if (!effectiveUserId) redirect("/admin/dashboard");

  const tier = await getManagerSubscriptionTier(effectiveUserId);
  const isFree = tier === "free";

  const sections = isFree
    ? managerPortal.sections.filter((s) => FREE_MANAGER_SECTIONS.has(s.section))
    : managerPortal.sections;

  const previewCookie = await getAdminPreviewFromCookies();
  const showPreviewBanner = session.profile?.role === "admin" && !!previewCookie?.targetUserId;

  let previewLabel: string | null = null;
  if (showPreviewBanner && previewCookie) {
    const supabase = createSupabaseServiceRoleClient();
    const { data: p } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", previewCookie.targetUserId)
      .maybeSingle();
    previewLabel = p?.full_name?.trim() || p?.email || previewCookie.targetUserId;
  }

  return {
    definition: { ...managerPortal, sections },
    showUpgradeBanner: isFree,
    showPreviewBanner,
    previewLabel,
  };
}
