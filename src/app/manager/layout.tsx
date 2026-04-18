import { PortalSidebar } from "@/components/portal/portal-sidebar";
import { PortalTopbar } from "@/components/portal/portal-topbar";
import { managerPortal } from "@/lib/portals/manager";

export default function ManagerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 lg:flex-row">
      <PortalSidebar definition={managerPortal} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <PortalTopbar definition={managerPortal} />
        <main className="flex-1 px-4 py-8 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
