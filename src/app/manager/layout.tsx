import { PublicNavbar } from "@/components/layout/public-navbar";
import { PortalSidebar } from "@/components/portal/portal-sidebar";
import { managerPortal } from "@/lib/portals/manager";

export default function ManagerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-slate-100/80 via-white to-slate-50/90">
      <PublicNavbar />
      <div className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col lg:flex-row">
        <PortalSidebar definition={managerPortal} />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-white/40 lg:bg-transparent">
          <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
