import { AxisAssistant } from "@/components/portal/axis-assistant";
import { PortalDataPrefetch } from "@/components/portal/portal-data-prefetch";
import { PortalMobileBackBar } from "@/components/portal/portal-mobile-back-bar";
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
import { vendorPortal } from "@/lib/portals/vendor";
import { getSidebarCollapsed } from "@/lib/portal-sidebar-state";

export default async function VendorLayout({ children }: { children: React.ReactNode }) {
  await assertPortalLayoutRole("vendor", "vendor");

  const { profile } = await getEffectiveSessionForPortal("vendor");
  const sidebarCollapsed = await getSidebarCollapsed();

  return (
    <AxisAssistant managerName={profile?.full_name ?? null}>
    <div className={PORTAL_SHELL_ROOT_CLASS}>
      <SurfaceThemeDefault theme="light" />
      <PublicHomePrefetch />
      <PortalDataPrefetch kind="vendor" />
      <div className="relative isolate flex min-h-0 w-full flex-1 flex-col overflow-hidden lg:flex-row">
        <PortalSkipLink />
        <PortalSidebar
          definition={vendorPortal}
          subscriptionTier={null}
          subtitle="Vendor"
          initialCollapsed={sidebarCollapsed}
        />
        <div className="relative z-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <PortalTopBar
            kind={vendorPortal.kind}
            basePath={vendorPortal.basePath}
            name={profile?.full_name ?? null}
            email={profile?.email ?? null}
          />
          <main id={PORTAL_MAIN_CONTENT_ID} tabIndex={-1} className={PORTAL_MAIN_CONTENT_CLASS}>
            <div className={PORTAL_MAIN_CONTENT_INNER_CLASS}>
              <PortalMobileBackBar definition={vendorPortal} />
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
    </AxisAssistant>
  );
}
