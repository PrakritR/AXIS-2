import { ChatFab } from "@/components/layout/chat-fab";
import { PortalSidebar } from "@/components/portal/portal-sidebar";
import { PortalTopbar } from "@/components/portal/portal-topbar";
import { adminPortal } from "@/lib/portals/admin";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950/[0.03] lg:flex-row">
      <PortalSidebar definition={adminPortal} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <PortalTopbar definition={adminPortal} />
        <main className="flex-1 px-4 py-8 lg:px-8">{children}</main>
      </div>
      <ChatFab />
    </div>
  );
}
