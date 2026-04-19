import type { ReactNode } from "react";
import { PublicNavbar } from "@/components/layout/public-navbar";
import { AdminPreviewBanner } from "@/components/portal/admin-preview-banner";
import { PortalSidebar } from "@/components/portal/portal-sidebar";
import { getAdminPreviewFromCookies } from "@/lib/auth/admin-preview";
import { getEffectiveSessionForPortal } from "@/lib/auth/effective-session";
import { assertPortalLayoutRole } from "@/lib/auth/portal-layout-guard";
import { getServerSessionProfile } from "@/lib/auth/server-profile";
import { ownerPortal } from "@/lib/portals/owner";

export default async function OwnerLayout({ children }: { children: ReactNode }) {
  await assertPortalLayoutRole("owner", "owner");

  const session = await getServerSessionProfile();
  const preview = await getAdminPreviewFromCookies();
  const showPreviewBanner = session.profile?.role === "admin" && preview?.portal === "owner";
  const { profile } = await getEffectiveSessionForPortal("owner");
  let previewLabel: string | null = null;
  if (showPreviewBanner && preview) {
    previewLabel = profile?.full_name?.trim() || profile?.email || preview.targetUserId;
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-slate-100/80 via-white to-slate-50/90">
      <PublicNavbar />
      {showPreviewBanner ? <AdminPreviewBanner label={previewLabel} /> : null}
      <div className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col lg:flex-row">
        <PortalSidebar definition={ownerPortal} />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
