import { PublicNavbar } from "@/components/layout/public-navbar";
import { ResidentPortalPillNav } from "@/components/portal/resident-portal-pill-nav";
import { ResidentPortalTopbar } from "@/components/portal/resident-portal-topbar";
import { PortalSidebar } from "@/components/portal/portal-sidebar";
import { getServerSessionProfile } from "@/lib/auth/server-profile";
import { getResidentPortalDefinition } from "@/lib/portals/resident";
import { residentHasFullPortalAccess } from "@/lib/resident-portal-access";

export default async function ResidentLayout({ children }: { children: React.ReactNode }) {
  const residentPortal = await getResidentPortalDefinition();
  const { profile, user } = await getServerSessionProfile();
  const workspaceUnlocked = residentHasFullPortalAccess({
    applicationApproved: profile?.application_approved ?? false,
    role: profile?.role,
    email: profile?.email ?? user?.email ?? null,
  });
  const displayName = profile?.full_name ?? profile?.email ?? user?.email ?? "Resident";

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-slate-100/80 via-white to-slate-50/90">
      <PublicNavbar />
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <PortalSidebar definition={residentPortal} />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <ResidentPortalTopbar displayName={displayName} />
          {workspaceUnlocked ? (
            <div className="border-b border-slate-200/70 bg-white/90 px-4 py-2.5 backdrop-blur-sm lg:px-8">
              <ResidentPortalPillNav />
            </div>
          ) : null}
          <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
