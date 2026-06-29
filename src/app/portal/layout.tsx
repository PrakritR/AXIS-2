import { AccountLinksSync } from "@/components/portal/account-links-sync";
import { AxisAssistant } from "@/components/portal/axis-assistant";
import { PortalDataPrefetch } from "@/components/portal/portal-data-prefetch";
import { PortalSidebar } from "@/components/portal/portal-sidebar";
import { PortalSkipLink } from "@/components/portal/portal-skip-link";
import { PortalTopBanners } from "@/components/portal/portal-top-banners";
import { PublicHomePrefetch } from "@/components/layout/public-home-prefetch";
import { SurfaceThemeDefault } from "@/components/providers/theme-provider";
import { getServerSessionProfile } from "@/lib/auth/server-profile";
import {
  PORTAL_MAIN_CONTENT_CLASS,
  PORTAL_MAIN_CONTENT_ID,
  PORTAL_MAIN_CONTENT_INNER_CLASS,
  PORTAL_SHELL_ROOT_CLASS,
} from "@/lib/portal-layout-classes";
import { buildProPortalDefinition } from "@/lib/portals/pro-nav";
import { MANAGER_PLAN_PORTAL_URL } from "@/lib/portals/manager-plan-path";

export default async function PropertyPortalLayout({ children }: { children: React.ReactNode }) {
  const [nav, { profile }] = await Promise.all([buildProPortalDefinition(), getServerSessionProfile()]);

  return (
    <AxisAssistant managerName={profile?.full_name ?? null}>
      <div className={PORTAL_SHELL_ROOT_CLASS}>
        <SurfaceThemeDefault theme="light" />
        <PublicHomePrefetch />
        <PortalDataPrefetch kind="pro" />
        <AccountLinksSync />
        <div className="shrink-0">
          <PortalTopBanners
            planHref={MANAGER_PLAN_PORTAL_URL}
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
              <div className={PORTAL_MAIN_CONTENT_INNER_CLASS}>{children}</div>
            </main>
          </div>
        </div>
      </div>
    </AxisAssistant>
  );
}
