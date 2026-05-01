import { PublicNavbar } from "@/components/layout/public-navbar";
import { AdminNotificationBanners } from "@/components/portal/admin-notification-banners";
import { PortalSidebar } from "@/components/portal/portal-sidebar";
import { assertAdminPortalAccess } from "@/lib/auth/portal-access";
import { PORTAL_MAIN_CONTENT_CLASS } from "@/lib/portal-layout-classes";
import { adminPortal } from "@/lib/portals/admin";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await assertAdminPortalAccess();
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#f5f5f7]">
      <PublicNavbar />
      <div className="relative isolate flex min-h-0 w-full flex-1 flex-col overflow-hidden lg:flex-row">
        <PortalSidebar definition={adminPortal} />
        <div className="relative z-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <main className={PORTAL_MAIN_CONTENT_CLASS}>
            <AdminNotificationBanners />
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
