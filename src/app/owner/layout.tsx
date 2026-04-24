import type { ReactNode } from "react";
import { PublicNavbar } from "@/components/layout/public-navbar";
import { PortalSidebar } from "@/components/portal/portal-sidebar";
import { getAdminPreviewFromCookies } from "@/lib/auth/admin-preview";
import { getEffectiveSessionForPortal, getEffectiveUserIdForPortal } from "@/lib/auth/effective-session";
import { getPortalAccessContext, hasAdminRole } from "@/lib/auth/portal-access";
import { assertPortalLayoutRole } from "@/lib/auth/portal-layout-guard";
import { getManagerSubscriptionTier } from "@/lib/manager-access";
import { ownerPortal } from "@/lib/portals/owner";
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
    <div className="flex min-h-screen flex-col bg-[#f5f5f7]">
      <PublicNavbar />
      <PortalTopBanners
        planHref="/owner/plan"
        showPreviewBanner={showPreviewBanner}
        previewLabel={previewLabel}
        showPlanBanner={showPlanBanner}
      />
      <div className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col lg:flex-row">
        <PortalSidebar definition={ownerPortal} />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <main className="flex min-h-0 flex-1 flex-col px-4 py-6 lg:px-8 lg:py-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
