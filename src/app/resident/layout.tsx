import { PublicNavbar } from "@/components/layout/public-navbar";
import { AdminPreviewBanner } from "@/components/portal/admin-preview-banner";
import { PortalSidebar } from "@/components/portal/portal-sidebar";
import { getAdminPreviewFromCookies } from "@/lib/auth/admin-preview";
import { getEffectiveSessionForPortal } from "@/lib/auth/effective-session";
import { getPortalAccessContext, hasAdminRole } from "@/lib/auth/portal-access";
import { assertPortalLayoutRole } from "@/lib/auth/portal-layout-guard";
import { getResidentPortalDefinition } from "@/lib/portals/resident";

export default async function ResidentLayout({ children }: { children: React.ReactNode }) {
  await assertPortalLayoutRole("resident", "resident");

  const residentPortal = await getResidentPortalDefinition();
  const { profile } = await getEffectiveSessionForPortal("resident");

  const ctx = await getPortalAccessContext();
  const preview = await getAdminPreviewFromCookies();
  const showPreviewBanner = hasAdminRole(ctx) && preview?.portal === "resident";
  let previewLabel: string | null = null;
  if (showPreviewBanner && preview) {
    previewLabel = profile?.full_name?.trim() || profile?.email || preview.targetUserId;
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#f5f5f7]">
      <PublicNavbar />
      {showPreviewBanner ? <AdminPreviewBanner label={previewLabel} /> : null}
      <div className="relative isolate flex min-h-0 w-full flex-1 flex-col overflow-x-hidden lg:flex-row">
        <PortalSidebar definition={residentPortal} />
        <div className="relative z-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-x-clip">
          <main className="relative z-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-x-clip px-4 py-6 lg:px-8 lg:py-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
