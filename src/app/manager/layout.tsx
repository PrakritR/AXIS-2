import { PublicNavbar } from "@/components/layout/public-navbar";
import { AccountLinksSync } from "@/components/portal/account-links-sync";
import { PortalTopBanners } from "@/components/portal/portal-top-banners";
import { PortalSidebar } from "@/components/portal/portal-sidebar";
import { buildManagerPortalDefinition } from "@/lib/portals/manager-nav";

export default async function ManagerLayout({ children }: { children: React.ReactNode }) {
  const nav = await buildManagerPortalDefinition();

  return (
    <div className="flex min-h-screen flex-col bg-[#f5f5f7]">
      <AccountLinksSync />
      <PublicNavbar />
      <PortalTopBanners
        planHref="/manager/plan"
        showPreviewBanner={nav.showPreviewBanner}
        previewLabel={nav.previewLabel}
        showPlanBanner={nav.showPlanBanner}
      />
      <div className="flex min-h-0 w-full flex-1 flex-col lg:flex-row">
        <PortalSidebar definition={nav.definition} />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden">
          <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden px-4 py-6 lg:px-8 lg:py-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
