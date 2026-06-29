import { AdminNotificationBanners } from "@/components/portal/admin-notification-banners";
import { AxisAssistant } from "@/components/portal/axis-assistant";
import { PortalSidebar } from "@/components/portal/portal-sidebar";
import { PortalSkipLink } from "@/components/portal/portal-skip-link";
import { PublicHomePrefetch } from "@/components/layout/public-home-prefetch";
import { SurfaceThemeDefault } from "@/components/providers/theme-provider";
import { assertAdminPortalAccess } from "@/lib/auth/portal-access";
import { getServerSessionProfile } from "@/lib/auth/server-profile";
import {
  PORTAL_MAIN_CONTENT_CLASS,
  PORTAL_MAIN_CONTENT_ID,
  PORTAL_MAIN_CONTENT_INNER_CLASS,
  PORTAL_SHELL_ROOT_CLASS,
} from "@/lib/portal-layout-classes";
import { adminPortal } from "@/lib/portals/admin";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await assertAdminPortalAccess();
  const { profile } = await getServerSessionProfile();
  return (
    <AxisAssistant managerName={profile?.full_name ?? null}>
      <div className={PORTAL_SHELL_ROOT_CLASS} data-surface="admin">
        <SurfaceThemeDefault theme="dark" />
        <PublicHomePrefetch />
        <div className="relative isolate flex min-h-0 w-full flex-1 flex-col overflow-hidden lg:flex-row">
          <PortalSkipLink />
          <PortalSidebar definition={adminPortal} />
          <div className="relative z-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <main id={PORTAL_MAIN_CONTENT_ID} tabIndex={-1} className={PORTAL_MAIN_CONTENT_CLASS}>
              <div className={PORTAL_MAIN_CONTENT_INNER_CLASS}>
                <AdminNotificationBanners />
                {children}
              </div>
            </main>
          </div>
        </div>
      </div>
    </AxisAssistant>
  );
}
