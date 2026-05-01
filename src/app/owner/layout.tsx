import type { ReactNode } from "react";
import { PublicNavbar } from "@/components/layout/public-navbar";
import { AccountLinksSync } from "@/components/portal/account-links-sync";
import { PortalSidebar } from "@/components/portal/portal-sidebar";
import { PORTAL_MAIN_CONTENT_CLASS } from "@/lib/portal-layout-classes";
import { getAdminPreviewFromCookies } from "@/lib/auth/admin-preview";
import { getEffectiveSessionForPortal, getEffectiveUserIdForPortal } from "@/lib/auth/effective-session";
import { getPortalAccessContext, hasAdminRole } from "@/lib/auth/portal-access";
import { assertPortalLayoutRole } from "@/lib/auth/portal-layout-guard";
import { getManagerSubscriptionTier } from "@/lib/manager-access";
import { proPortal } from "@/lib/portals/pro";
import { PortalTopBanners } from "@/components/portal/portal-top-banners";

export default async function OwnerLayout({ children }: { children: ReactNode }) {
  await assertPortalLayoutRole("owner", "owner");

  const ctx = await getPortalAccessContext();
  const preview = await getAdminPreviewFromCookies();
  const showPreviewBanner = hasAdminRole(ctx) && preview?.portal === "owner";
  const { profile } = await getEffectiveSessionForPortal("owner");
  let previewLabel: string | null = null;
  if (showPreviewBanner && preview) {
    previewLabel = profile?.full_name?.trim() || profile?.email || preview.targetUserId;
  }

  const ownerUid = await getEffectiveUserIdForPortal("owner");
  const ownerTier = ownerUid ? await getManagerSubscriptionTier(ownerUid) : null;
  const showPlanBanner = ownerTier === "free";

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <AccountLinksSync />
      <PublicNavbar />
      <div className="shrink-0">
        <PortalTopBanners
          planHref="/owner/plan"
          showPreviewBanner={showPreviewBanner}
          previewLabel={previewLabel}
          showPlanBanner={showPlanBanner}
        />
      </div>
      <div className="relative isolate flex min-h-0 w-full flex-1 flex-col overflow-hidden lg:flex-row">
        <PortalSidebar definition={proPortal} />
        <div className="relative z-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <main className={PORTAL_MAIN_CONTENT_CLASS}>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
