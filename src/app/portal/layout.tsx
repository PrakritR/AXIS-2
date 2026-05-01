import { PublicNavbar } from "@/components/layout/public-navbar";
import { AccountLinksSync } from "@/components/portal/account-links-sync";
import { PortalSidebar } from "@/components/portal/portal-sidebar";
import { PortalTopBanners } from "@/components/portal/portal-top-banners";
import { buildProPortalDefinition } from "@/lib/portals/pro-nav";

export default async function PropertyPortalLayout({ children }: { children: React.ReactNode }) {
  const nav = await buildProPortalDefinition();

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#f5f5f7]">
      <AccountLinksSync />
      <PublicNavbar />
      <PortalTopBanners
        planHref="/portal/plan"
        showPreviewBanner={nav.showPreviewBanner}
        previewLabel={nav.previewLabel}
        showPlanBanner={nav.showPlanBanner}
      />
      <div className="relative isolate flex min-h-0 w-full flex-1 flex-col overflow-hidden lg:flex-row">
        <PortalSidebar definition={nav.definition} />
        <div className="relative z-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <main className="relative z-0 min-h-0 min-w-0 flex-1 overflow-x-clip overflow-y-auto overscroll-contain px-4 py-6 lg:px-8 lg:py-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
