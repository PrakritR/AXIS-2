import { PublicNavbar } from "@/components/layout/public-navbar";
import { AdminNotificationBanners } from "@/components/portal/admin-notification-banners";
import { PortalSidebar } from "@/components/portal/portal-sidebar";
import { assertAdminPortalAccess } from "@/lib/auth/portal-access";
import { adminPortal } from "@/lib/portals/admin";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await assertAdminPortalAccess();
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-slate-100/80 via-white to-slate-50/90">
      <PublicNavbar />
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <PortalSidebar definition={adminPortal} />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <main className="flex min-h-0 flex-1 flex-col px-4 py-6 lg:px-8 lg:py-8">
            <AdminNotificationBanners />
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
