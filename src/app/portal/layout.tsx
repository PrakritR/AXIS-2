import { AccountLinksSync } from "@/components/portal/account-links-sync";
import { PortalDataPrefetch } from "@/components/portal/portal-data-prefetch";
import { PortalSidebar } from "@/components/portal/portal-sidebar";
import { PortalSkipLink } from "@/components/portal/portal-skip-link";
import { PortalTopBanners } from "@/components/portal/portal-top-banners";
import { PublicHomePrefetch } from "@/components/layout/public-home-prefetch";
import { SurfaceThemeDefault } from "@/components/providers/theme-provider";
import { PORTAL_MAIN_CONTENT_CLASS, PORTAL_MAIN_CONTENT_ID, PORTAL_SHELL_ROOT_CLASS } from "@/lib/portal-layout-classes";
import { buildProPortalDefinition } from "@/lib/portals/pro-nav";

export default async function PropertyPortalLayout({ children }: { children: React.ReactNode }) {
  const nav = await buildProPortalDefinition();

  return (
    <div className={PORTAL_SHELL_ROOT_CLASS}>
      <SurfaceThemeDefault theme="light" />
      <PublicHomePrefetch />
      <PortalDataPrefetch kind="pro" />
      <AccountLinksSync />
      <div className="shrink-0">
        <PortalTopBanners
          planHref="/portal/plan"
          showPreviewBanner={nav.showPreviewBanner}
          previewLabel={nav.previewLabel}
          showPlanBanner={nav.showPlanBanner}
        />
      </div>
      <div className="relative isolate flex min-h-0 w-full flex-1 flex-col overflow-hidden lg:flex-row">
        <PortalSkipLink />
        <PortalSidebar definition={nav.definition} subscriptionTier={nav.subscriptionTier} />
        <div className="relative z-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <main id={PORTAL_MAIN_CONTENT_ID} tabIndex={-1} className={PORTAL_MAIN_CONTENT_CLASS}>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
