import { PublicNavbar } from "@/components/layout/public-navbar";
import { AccountLinksSync } from "@/components/portal/account-links-sync";
import { PortalSidebar } from "@/components/portal/portal-sidebar";
import { PortalTopBanners } from "@/components/portal/portal-top-banners";
import { PORTAL_MAIN_CONTENT_CLASS } from "@/lib/portal-layout-classes";
import { buildProPortalDefinition } from "@/lib/portals/pro-nav";

export default async function PropertyPortalLayout({ children }: { children: React.ReactNode }) {
  const nav = await buildProPortalDefinition();

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <AccountLinksSync />
      <PublicNavbar />
      <div className="shrink-0">
        <PortalTopBanners
          planHref="/portal/plan"
          showPreviewBanner={nav.showPreviewBanner}
          previewLabel={nav.previewLabel}
          showPlanBanner={nav.showPlanBanner}
        />
      </div>
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
