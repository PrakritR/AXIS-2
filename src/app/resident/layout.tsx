import { AxisAssistant } from "@/components/portal/axis-assistant";
import { PortalDataPrefetch } from "@/components/portal/portal-data-prefetch";
import { PortalMobileNavBar } from "@/components/portal/portal-mobile-nav-bar";
import { ResidentPreApplicationGuard } from "@/components/portal/resident-pre-application-guard";
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
import { getManagerSubscriptionTierByManagerId } from "@/lib/manager-access-server";
import { loadResidentPortalAccessState } from "@/lib/resident-portal-access";
import { getResidentPortalDefinition } from "@/lib/portals/resident";
import { getSidebarCollapsed } from "@/lib/portal-sidebar-state";

export default async function ResidentLayout({ children }: { children: React.ReactNode }) {
  await assertPortalLayoutRole("resident", "resident");

  const residentPortal = await getResidentPortalDefinition();
  const { profile, user } = await getEffectiveSessionForPortal("resident");
  const managerSubscriptionTier = profile?.manager_id?.trim()
    ? await getManagerSubscriptionTierByManagerId(profile.manager_id.trim())
    : null;
  const access = await loadResidentPortalAccessState({
    userId: user?.id ?? null,
    role: profile?.role,
    email: profile?.email ?? user?.email ?? null,
    managerSubscriptionTier,
  });
  const sidebarCollapsed = await getSidebarCollapsed();

  return (
    <AxisAssistant managerName={profile?.full_name ?? null}>
    <div className={PORTAL_SHELL_ROOT_CLASS}>
      <SurfaceThemeDefault theme="light" />
      <PublicHomePrefetch />
      <PortalDataPrefetch kind="resident" />
      <div className="relative isolate flex min-h-0 w-full flex-1 flex-col overflow-hidden lg:flex-row">
        <PortalSkipLink />
        <PortalSidebar
          definition={residentPortal}
          subscriptionTier={managerSubscriptionTier}
          subtitle="Resident"
          initialCollapsed={sidebarCollapsed}
        />
        <div className="relative z-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <PortalTopBar
            kind={residentPortal.kind}
            basePath={residentPortal.basePath}
            name={profile?.full_name ?? null}
            email={profile?.email ?? null}
          />
          <main id={PORTAL_MAIN_CONTENT_ID} tabIndex={-1} className={PORTAL_MAIN_CONTENT_CLASS}>
            <div className={PORTAL_MAIN_CONTENT_INNER_CLASS}>
              <PortalMobileNavBar
                definition={residentPortal}
                name={profile?.full_name ?? null}
                email={profile?.email ?? null}
              />
              <ResidentPreApplicationGuard leaseAccessUnlocked={access.leaseAccessUnlocked}>
                {children}
              </ResidentPreApplicationGuard>
            </div>
          </main>
        </div>
      </div>
    </div>
    </AxisAssistant>
  );
}
