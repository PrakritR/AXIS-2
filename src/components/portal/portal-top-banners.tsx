"use client";

import { usePathname } from "next/navigation";
import { AdminPreviewBanner } from "@/components/portal/admin-preview-banner";
import { ManagerPlanBanner } from "@/components/portal/manager-plan-banner";

/**
 * Portal chrome below the marketing navbar. Hides the upgrade strip on the Plan page
 * so stacked banners don’t shift layout while editing the plan.
 */
export function PortalTopBanners({
  planHref,
  showPreviewBanner,
  previewLabel,
  showPlanBanner,
}: {
  planHref: "/manager/plan" | "/pro/plan" | "/portal/plan";
  showPreviewBanner: boolean;
  previewLabel: string | null;
  showPlanBanner: boolean;
}) {
  const pathname = usePathname();
  const onPlanPage = pathname === planHref;

  return (
    <>
      {showPreviewBanner ? <AdminPreviewBanner label={previewLabel} /> : null}
      {showPlanBanner && !onPlanPage ? (
        <div className="shrink-0 border-b border-[rgba(160,107,21,0.28)] bg-[rgba(253,236,203,0.42)] backdrop-blur-xl [&>div]:border-0 [&>div]:bg-transparent">
          <ManagerPlanBanner planHref={planHref} />
        </div>
      ) : null}
    </>
  );
}
