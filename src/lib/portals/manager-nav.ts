import { portalDashboardPath } from "@/components/auth/portal-switcher";
import { redirect } from "next/navigation";
import { getAdminPreviewFromCookies } from "@/lib/auth/admin-preview";
import { getEffectiveUserIdForPortal } from "@/lib/auth/effective-session";
import { getPortalAccessContext, hasAdminRole, hasRole } from "@/lib/auth/portal-access";
import { getManagerSubscriptionTier } from "@/lib/manager-access";
import type { PortalDefinition } from "@/lib/portal-types";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { managerPortal } from "./manager";

export async function buildManagerPortalDefinition(): Promise<{
  definition: PortalDefinition;
  showPlanBanner: boolean;
  showPreviewBanner: boolean;
  previewLabel: string | null;
}> {
  const ctx = await getPortalAccessContext();
  if (!ctx.user) redirect("/auth/sign-in");

  const preview = await getAdminPreviewFromCookies();
  if (hasAdminRole(ctx) && preview?.portal === "manager") {
    /* admin preview — allowed */
  } else if (hasAdminRole(ctx) && !hasRole(ctx, "manager")) {
    redirect("/admin/dashboard");
  } else if (!hasRole(ctx, "manager")) {
    redirect("/auth/sign-in");
  } else if (ctx.roles.length > 1 && ctx.effectiveRole === null) {
    redirect(`/auth/choose-portal?next=${encodeURIComponent("/manager/dashboard")}`);
  } else if (ctx.effectiveRole !== "manager") {
    redirect(portalDashboardPath(ctx.effectiveRole ?? "resident"));
  }

  const effectiveUserId = await getEffectiveUserIdForPortal("manager");
  if (!effectiveUserId) redirect("/admin/dashboard");

  const tier = await getManagerSubscriptionTier(effectiveUserId);
  const isFree = tier === "free";

  const sections = managerPortal.sections;

  const showPreviewBanner = hasAdminRole(ctx) && !!preview?.targetUserId;

  let previewLabel: string | null = null;
  if (showPreviewBanner && preview) {
    const supabase = createSupabaseServiceRoleClient();
    const { data: p } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", preview.targetUserId)
      .maybeSingle();
    previewLabel = p?.full_name?.trim() || p?.email || preview.targetUserId;
  }

  return {
    definition: { ...managerPortal, sections },
    showPlanBanner: isFree,
    showPreviewBanner,
    previewLabel,
  };
}
