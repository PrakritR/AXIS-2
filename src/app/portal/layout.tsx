import { AccountLinksSync } from "@/components/portal/account-links-sync";
import { PropertyPipelineAccountSync } from "@/components/portal/property-pipeline-account-sync";
import { AxisAssistant } from "@/components/portal/axis-assistant";
import { PortalAssistantRail } from "@/components/portal/portal-assistant-rail";
import { PortalDataPrefetch } from "@/components/portal/portal-data-prefetch";
import { PortalMobileNavBar } from "@/components/portal/portal-mobile-nav-bar";
import { PortalSidebar } from "@/components/portal/portal-sidebar";
import { PortalSkipLink } from "@/components/portal/portal-skip-link";
import { PortalTopBar } from "@/components/portal/portal-top-bar";
import { PublicHomePrefetch } from "@/components/layout/public-home-prefetch";
import { SurfaceThemeDefault } from "@/components/providers/theme-provider";
import { assertPropertyPortalAccess } from "@/lib/auth/portal-access";
import { getServerSessionProfile } from "@/lib/auth/server-profile";
import {
  PORTAL_MAIN_CONTENT_CLASS,
  PORTAL_MAIN_CONTENT_ID,
  PORTAL_MAIN_CONTENT_INNER_CLASS,
  PORTAL_SHELL_ROOT_CLASS,
} from "@/lib/portal-layout-classes";
import { buildProPortalDefinition } from "@/lib/portals/pro-nav";
import { getSidebarCollapsed } from "@/lib/portal-sidebar-state";
import { getAssistantDockCollapsed } from "@/lib/assistant-dock-state";

export default async function PropertyPortalLayout({ children }: { children: React.ReactNode }) {
  // A production admin (founder/ops) identity must not cross into the property
  // portal even by typing the URL — hiding the switch is not access control.
  await assertPropertyPortalAccess();

  const [nav, { profile }, sidebarCollapsed, assistantDockCollapsed] = await Promise.all([
    buildProPortalDefinition(),
    getServerSessionProfile(),
    getSidebarCollapsed(),
    getAssistantDockCollapsed(),
  ]);

  return (
    <AxisAssistant managerName={profile?.full_name ?? null}>
      <div className={PORTAL_SHELL_ROOT_CLASS}>
        <SurfaceThemeDefault theme="light" />
        <PublicHomePrefetch />
        <PortalDataPrefetch kind="pro" />
        <PropertyPipelineAccountSync />
        <AccountLinksSync />
        <div className="relative isolate flex min-h-0 w-full flex-1 flex-col overflow-hidden lg:flex-row">
          <PortalSkipLink />
          <PortalSidebar
            definition={nav.definition}
            subscriptionTier={nav.subscriptionTier}
            subtitle={nav.planLabel}
            initialCollapsed={sidebarCollapsed}
          />
          <div className="relative z-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <PortalTopBar
              kind={nav.definition.kind}
              basePath={nav.definition.basePath}
              name={profile?.full_name ?? null}
              email={profile?.email ?? null}
            />
            <main id={PORTAL_MAIN_CONTENT_ID} tabIndex={-1} className={PORTAL_MAIN_CONTENT_CLASS}>
              <div className={PORTAL_MAIN_CONTENT_INNER_CLASS}>
                <PortalMobileNavBar
                  definition={nav.definition}
                  name={profile?.full_name ?? null}
                  email={profile?.email ?? null}
                />
                {children}
              </div>
            </main>
          </div>
          <PortalAssistantRail
            managerName={profile?.full_name ?? null}
            initialCollapsed={assistantDockCollapsed}
          />
        </div>
      </div>
    </AxisAssistant>
  );
}
