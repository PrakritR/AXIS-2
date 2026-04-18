import { PublicAnnouncement } from "@/components/layout/public-announcement";
import { PublicNavbar } from "@/components/layout/public-navbar";
import { AdminPortalTopbar } from "@/components/portal/admin-portal-topbar";
import { PortalSidebar } from "@/components/portal/portal-sidebar";
import { adminPortal } from "@/lib/portals/admin";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-slate-100/80 via-white to-slate-50/90">
      <PublicAnnouncement />
      <PublicNavbar />
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <PortalSidebar definition={adminPortal} />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <AdminPortalTopbar />
          <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
