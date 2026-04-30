import { portalDashboardPath } from "@/components/auth/portal-switcher";
import { redirect } from "next/navigation";
import { getAdminPreviewFromCookies } from "@/lib/auth/admin-preview";
import { getEffectiveUserIdForPortal } from "@/lib/auth/effective-session";
import { getPortalAccessContext, hasAdminRole, hasRole } from "@/lib/auth/portal-access";
import { getManagerPurchaseSku, normalizeManagerSkuTier, paidWorkspacePortalTitle } from "@/lib/manager-access";
import type { PreviewPortal } from "@/lib/auth/preview-types";
import type { PortalDefinition } from "@/lib/portal-types";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { proPortal } from "./pro";
import { cache } from "react";

export const getProPortalRenderContext = cache(async () => {
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
    redirect(`/auth/choose-portal?next=${encodeURIComponent("/portal/dashboard")}`);
  } else if (ctx.effectiveRole !== null && ctx.effectiveRole !== "manager" && ctx.effectiveRole !== "owner") {
    redirect(portalDashboardPath(ctx.effectiveRole));
  }

  const previewPortal: PreviewPortal = ctx.effectiveRole === "owner" ? "owner" : "manager";
  const effectiveUserId = await getEffectiveUserIdForPortal(previewPortal);
  if (!effectiveUserId) redirect("/admin/dashboard");

  const purchase = await getManagerPurchaseSku(effectiveUserId);
  const portalTitle = paidWorkspacePortalTitle(purchase.tier, purchase.stripeSubscriptionId);
  const missingTier = purchase.tier == null || String(purchase.tier).trim() === "";
  const stripeManaged = Boolean(purchase.stripeSubscriptionId);
  const isFree = normalizeManagerSkuTier(purchase.tier) === "free" || (missingTier && !stripeManaged);
  const subscriptionTier: "free" | "paid" | null =
    purchase.tier == null || String(purchase.tier).trim() === ""
      ? null
      : String(purchase.tier).toLowerCase() === "free"
        ? "free"
        : "paid";

  return {
    ctx,
    preview,
    effectiveUserId,
    purchase,
    portalTitle,
    isFree,
    subscriptionTier,
  };
});

export async function buildProPortalDefinition(): Promise<{
  definition: PortalDefinition;
  showPlanBanner: boolean;
  showPreviewBanner: boolean;
  previewLabel: string | null;
}> {
  const { ctx, preview, portalTitle, isFree } = await getProPortalRenderContext();

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
    definition: { ...proPortal, sections: proPortal.sections, title: portalTitle },
    showPlanBanner: isFree,
    showPreviewBanner,
    previewLabel,
  };
}
