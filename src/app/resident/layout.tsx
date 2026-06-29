import { AdminPreviewBanner } from "@/components/portal/admin-preview-banner";
import { PortalDataPrefetch } from "@/components/portal/portal-data-prefetch";
import { PortalMobileBackBar } from "@/components/portal/portal-mobile-back-bar";
import { PortalSidebar } from "@/components/portal/portal-sidebar";
import { PortalSkipLink } from "@/components/portal/portal-skip-link";
import { PublicHomePrefetch } from "@/components/layout/public-home-prefetch";
import { SurfaceThemeDefault } from "@/components/providers/theme-provider";
import {
  PORTAL_MAIN_CONTENT_CLASS,
  PORTAL_MAIN_CONTENT_ID,
  PORTAL_MAIN_CONTENT_INNER_CLASS,
  PORTAL_SHELL_ROOT_CLASS,
  PORTAL_TOP_BANNER_STRIP_CLASS,
} from "@/lib/portal-layout-classes";
import { getAdminPreviewFromCookies } from "@/lib/auth/admin-preview";
import { getEffectiveSessionForPortal } from "@/lib/auth/effective-session";
import { getPortalAccessContext, hasAdminRole } from "@/lib/auth/portal-access";
import { assertPortalLayoutRole } from "@/lib/auth/portal-layout-guard";
import { getManagerSubscriptionTierByManagerId } from "@/lib/manager-access-server";
import { getResidentPortalDefinition } from "@/lib/portals/resident";

export default async function ResidentLayout({ children }: { children: React.ReactNode }) {
  await assertPortalLayoutRole("resident", "resident");

  const residentPortal = await getResidentPortalDefinition();
  const { profile } = await getEffectiveSessionForPortal("resident");
  const managerSubscriptionTier = profile?.manager_id?.trim()
    ? await getManagerSubscriptionTierByManagerId(profile.manager_id.trim())
    : null;

  const ctx = await getPortalAccessContext();
  const preview = await getAdminPreviewFromCookies();
  const showPreviewBanner = hasAdminRole(ctx) && preview?.portal === "resident";
  let previewLabel: string | null = null;
  if (showPreviewBanner && preview) {
    previewLabel = profile?.full_name?.trim() || profile?.email || preview.targetUserId;
  }

  return (
    <div className={PORTAL_SHELL_ROOT_CLASS}>
      <SurfaceThemeDefault theme="light" />
      <PublicHomePrefetch />
      <PortalDataPrefetch kind="resident" />
      {showPreviewBanner ? (
        <div className={`${PORTAL_TOP_BANNER_STRIP_CLASS} shrink-0`}>
          <AdminPreviewBanner label={previewLabel} />
        </div>
      ) : null}
      <div className="relative isolate flex min-h-0 w-full flex-1 flex-col overflow-hidden lg:flex-row">
        <PortalSkipLink />
        <PortalSidebar definition={residentPortal} subscriptionTier={managerSubscriptionTier} />
        <div className="relative z-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <main id={PORTAL_MAIN_CONTENT_ID} tabIndex={-1} className={PORTAL_MAIN_CONTENT_CLASS}>
            <div className={PORTAL_MAIN_CONTENT_INNER_CLASS}>
              <PortalMobileBackBar definition={residentPortal} />
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
