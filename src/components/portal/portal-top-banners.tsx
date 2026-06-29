"use client";

import { usePathname } from "next/navigation";
import { AdminPreviewBanner } from "@/components/portal/admin-preview-banner";
import { ManagerPlanBanner } from "@/components/portal/manager-plan-banner";
import { PORTAL_TOP_BANNER_STRIP_CLASS } from "@/lib/portal-layout-classes";
import { MANAGER_PLAN_PORTAL_PATH } from "@/lib/portals/manager-plan-path";

/**
 * Portal chrome below the marketing navbar. Hides the upgrade strip on Settings
 * (where plan lives) so stacked banners don’t shift layout while editing the plan.
 */
export function PortalTopBanners({
  planHref,
  showPreviewBanner,
  previewLabel,
  showPlanBanner,
}: {
  planHref: string;
  showPreviewBanner: boolean;
  previewLabel: string | null;
  showPlanBanner: boolean;
}) {
  const pathname = usePathname();
  const onPlanPage = pathname === MANAGER_PLAN_PORTAL_PATH || pathname === planHref;
  const hasBanner = showPreviewBanner || (showPlanBanner && !onPlanPage);

  if (!hasBanner) return null;

  return (
    <div className={`${PORTAL_TOP_BANNER_STRIP_CLASS} shrink-0`}>
      {showPreviewBanner ? <AdminPreviewBanner label={previewLabel} /> : null}
      {showPlanBanner && !onPlanPage ? (
        <div className="border-b border-[rgba(160,107,21,0.28)] bg-[rgba(253,236,203,0.42)] backdrop-blur-xl [&>div]:border-0 [&>div]:bg-transparent">
          <ManagerPlanBanner planHref={planHref} />
        </div>
      ) : null}
    </div>
  );
}
