import { PublicAnnouncement } from "@/components/layout/public-announcement";
import { PublicNavbar } from "@/components/layout/public-navbar";
import { ResidentPortalPillNav } from "@/components/portal/resident-portal-pill-nav";
import { ResidentPortalTopbar } from "@/components/portal/resident-portal-topbar";
import { PortalSidebar } from "@/components/portal/portal-sidebar";
import { getResidentPortalDefinition } from "@/lib/portals/resident";
import { isResidentApplicationApproved } from "@/lib/portals/resident-state";

export default function ResidentLayout({ children }: { children: React.ReactNode }) {
  const residentPortal = getResidentPortalDefinition();
  const applicationApproved = isResidentApplicationApproved();

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-slate-50 via-white to-slate-50/80">
      <PublicAnnouncement />
      <PublicNavbar />
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <PortalSidebar definition={residentPortal} />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-white/40 lg:bg-transparent">
          <ResidentPortalTopbar />
          {applicationApproved ? (
            <div className="border-b border-slate-200/70 bg-white/85 px-4 py-3 backdrop-blur-sm lg:px-8">
              <div className="mx-auto max-w-6xl">
                <ResidentPortalPillNav />
              </div>
            </div>
          ) : null}
          <main className="flex-1 px-4 py-5 sm:py-6 lg:px-8 lg:py-7">{children}</main>
        </div>
      </div>
    </div>
  );
}
