import { AxisAssistant } from "@/components/portal/axis-assistant";
import { PortalDataPrefetch } from "@/components/portal/portal-data-prefetch";
import { PortalMobileNavBar } from "@/components/portal/portal-mobile-nav-bar";
import { PortalSidebar } from "@/components/portal/portal-sidebar";
import { PortalSkipLink } from "@/components/portal/portal-skip-link";
import { PortalTopBar } from "@/components/portal/portal-top-bar";
import { PublicHomePrefetch } from "@/components/layout/public-home-prefetch";
import { SurfaceThemeDefault } from "@/components/providers/theme-provider";
import {
  PORTAL_MAIN_CONTENT_CLASS,
  PORTAL_MAIN_CONTENT_ID,
  PORTAL_MAIN_CONTENT_INNER_CLASS,
  PORTAL_SHELL_ROOT_CLASS,
} from "@/lib/portal-layout-classes";
import { getEffectiveSessionForPortal } from "@/lib/auth/effective-session";
import { assertPortalLayoutRole } from "@/lib/auth/portal-layout-guard";
import { ownerPortal } from "@/lib/portals/owner";
import { getSidebarCollapsed } from "@/lib/portal-sidebar-state";

export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  await assertPortalLayoutRole("owner", "owner");

  const { profile } = await getEffectiveSessionForPortal("owner");
  const sidebarCollapsed = await getSidebarCollapsed();

  return (
    <AxisAssistant managerName={profile?.full_name ?? null}>
    <div className={PORTAL_SHELL_ROOT_CLASS}>
      <SurfaceThemeDefault theme="light" />
      <PublicHomePrefetch />
      <PortalDataPrefetch kind="owner" />
      <div className="relative isolate flex min-h-0 w-full flex-1 flex-col overflow-hidden lg:flex-row">
        <PortalSkipLink />
        <PortalSidebar
          definition={ownerPortal}
          subscriptionTier={null}
          subtitle="Owner"
          initialCollapsed={sidebarCollapsed}
        />
        <div className="relative z-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <PortalTopBar
            kind={ownerPortal.kind}
            basePath={ownerPortal.basePath}
            name={profile?.full_name ?? null}
            email={profile?.email ?? null}
          />
          <main id={PORTAL_MAIN_CONTENT_ID} tabIndex={-1} className={PORTAL_MAIN_CONTENT_CLASS}>
            <div className={PORTAL_MAIN_CONTENT_INNER_CLASS}>
              <PortalMobileNavBar
                definition={ownerPortal}
                name={profile?.full_name ?? null}
                email={profile?.email ?? null}
              />
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
    </AxisAssistant>
  );
}
