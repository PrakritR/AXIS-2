import { portalDashboardPath } from "@/components/auth/portal-switcher";
import { redirect } from "next/navigation";
import { getAdminPreviewFromCookies } from "@/lib/auth/admin-preview";
import { getEffectiveUserIdForPortal } from "@/lib/auth/effective-session";
import { getPortalAccessContext, hasAdminRole, hasRole } from "@/lib/auth/portal-access";
import { getManagerSubscriptionTier } from "@/lib/manager-access";
import type { PreviewPortal } from "@/lib/auth/preview-types";
import type { PortalDefinition } from "@/lib/portal-types";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { proPortal } from "./pro";

export async function buildProPortalDefinition(): Promise<{
  definition: PortalDefinition;
  showPlanBanner: boolean;
  showPreviewBanner: boolean;
  previewLabel: string | null;
}> {
  const ctx = await getPortalAccessContext();
  if (!ctx.user) redirect("/auth/sign-in");

  const preview = await getAdminPreviewFromCookies();
  if (hasAdminRole(ctx) && preview?.portal === "manager") {
    /* admin preview as manager — allowed */
  } else if (hasAdminRole(ctx) && preview?.portal === "owner") {
    /* admin preview as owner — allowed */
  } else if (hasAdminRole(ctx) && !hasRole(ctx, "manager") && !hasRole(ctx, "owner")) {
    redirect("/admin/dashboard");
  } else if (!hasRole(ctx, "manager") && !hasRole(ctx, "owner")) {
    redirect("/auth/sign-in");
  } else if (ctx.roles.length > 1 && ctx.effectiveRole === null) {
    redirect(`/auth/choose-portal?next=${encodeURIComponent("/pro/dashboard")}`);
  } else if (
    ctx.effectiveRole !== null &&
    ctx.effectiveRole !== "manager" &&
    ctx.effectiveRole !== "owner"
  ) {
    redirect(portalDashboardPath(ctx.effectiveRole));
  }

  const previewPortal: PreviewPortal = ctx.effectiveRole === "owner" ? "owner" : "manager";
  const effectiveUserId = await getEffectiveUserIdForPortal(previewPortal);
  if (!effectiveUserId) redirect("/admin/dashboard");

  const tier = await getManagerSubscriptionTier(effectiveUserId);
  const isFree = tier === "free";

  const previewCookie = await getAdminPreviewFromCookies();
  const showPreviewBanner = hasAdminRole(ctx) && !!previewCookie?.targetUserId;

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
    definition: { ...proPortal, sections: proPortal.sections },
    showPlanBanner: isFree,
    showPreviewBanner,
    previewLabel,
  };
}
