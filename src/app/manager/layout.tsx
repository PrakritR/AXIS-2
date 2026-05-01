import { PublicNavbar } from "@/components/layout/public-navbar";
import { AccountLinksSync } from "@/components/portal/account-links-sync";
import { PortalTopBanners } from "@/components/portal/portal-top-banners";
import { PortalSidebar } from "@/components/portal/portal-sidebar";
import { PORTAL_MAIN_CONTENT_CLASS } from "@/lib/portal-layout-classes";
import { buildManagerPortalDefinition } from "@/lib/portals/manager-nav";

export default async function ManagerLayout({ children }: { children: React.ReactNode }) {
  const nav = await buildManagerPortalDefinition();

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#f5f5f7]">
      <AccountLinksSync />
      <PublicNavbar />
      <PortalTopBanners
        planHref="/manager/plan"
        showPreviewBanner={nav.showPreviewBanner}
        previewLabel={nav.previewLabel}
        showPlanBanner={nav.showPlanBanner}
      />
      <div className="relative isolate flex min-h-0 w-full flex-1 flex-col overflow-hidden lg:flex-row">
        <PortalSidebar definition={nav.definition} />
        <div className="relative z-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <main className={PORTAL_MAIN_CONTENT_CLASS}>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
