import { PublicAnnouncement } from "@/components/layout/public-announcement";
import { PublicNavbar } from "@/components/layout/public-navbar";
import { PortalSidebar } from "@/components/portal/portal-sidebar";
import { managerPortal } from "@/lib/portals/manager";

export default function ManagerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-slate-50 via-white to-slate-50/80">
      <PublicAnnouncement />
      <PublicNavbar />
      <div className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col lg:flex-row">
        <PortalSidebar definition={managerPortal} />
        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
