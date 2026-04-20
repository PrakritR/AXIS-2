import { portalDashboardPath } from "@/components/auth/portal-switcher";
import { redirect } from "next/navigation";
import { getAdminPreviewFromCookies } from "@/lib/auth/admin-preview";
import type { PreviewPortal } from "@/lib/auth/preview-types";
import { getPortalAccessContext, hasAdminRole, hasRole } from "@/lib/auth/portal-access";

/**
 * Ensures only the correct role (or admin with matching preview cookie) can load a portal layout.
 */
export async function assertPortalLayoutRole(portal: PreviewPortal, role: "manager" | "resident" | "owner") {
  const ctx = await getPortalAccessContext();
  if (!ctx.user) redirect("/auth/sign-in");

  const preview = await getAdminPreviewFromCookies();
  if (hasAdminRole(ctx) && preview?.portal === portal) {
    return;
  }

  if (!hasRole(ctx, role)) {
    redirect("/auth/sign-in");
  }

  if (ctx.roles.length > 1 && ctx.effectiveRole === null) {
    redirect(`/auth/choose-portal?next=${encodeURIComponent(portalDashboardPath(role))}`);
  }

  if (ctx.effectiveRole !== role) {
    redirect(portalDashboardPath(ctx.effectiveRole ?? "resident"));
  }
}
