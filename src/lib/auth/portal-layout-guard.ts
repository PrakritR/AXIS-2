import { portalDashboardPath } from "@/lib/auth/portal-roles";
import { redirect } from "next/navigation";
import { getAdminPreviewFromCookies } from "@/lib/auth/admin-preview";
import type { PreviewPortal } from "@/lib/auth/preview-types";
import { getPortalAccessContext, hasAdminRole, hasRole } from "@/lib/auth/portal-access";

/**
 * Ensures only the correct role (or admin with matching preview cookie) can load a portal layout.
 */
export async function assertPortalLayoutRole(
  portal: PreviewPortal,
  role: "manager" | "resident" | "vendor",
  options?: { allowSignedInApplyGate?: boolean; allowResidentTourAccess?: boolean },
) {
  const ctx = await getPortalAccessContext();
  if (!ctx.user) redirect("/auth/sign-in");

  const preview = await getAdminPreviewFromCookies();
  if (hasAdminRole(ctx) && preview?.portal === portal) {
    return;
  }

  const applyGateBypass =
    options?.allowSignedInApplyGate === true && portal === "resident" && Boolean(ctx.user);

  const tourGateBypass =
    options?.allowResidentTourAccess === true &&
    portal === "resident" &&
    hasRole(ctx, "resident");

  if (!hasRole(ctx, role)) {
    if (applyGateBypass || tourGateBypass) return;
    redirect("/auth/sign-in");
  }

  if (ctx.roles.length > 1 && ctx.effectiveRole === null) {
    redirect(`/auth/choose-portal?next=${encodeURIComponent(portalDashboardPath(role))}`);
  }

  if (ctx.effectiveRole !== role) {
    if (applyGateBypass || tourGateBypass) return;
    redirect(portalDashboardPath(ctx.effectiveRole ?? "resident"));
  }
}
