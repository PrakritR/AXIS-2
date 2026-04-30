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
  planHref: "/manager/plan" | "/owner/plan" | "/pro/plan" | "/portal/plan";
  showPreviewBanner: boolean;
  previewLabel: string | null;
  showPlanBanner: boolean;
}) {
  const pathname = usePathname();
  const onPlanPage = pathname === planHref;

  return (
    <>
      {showPreviewBanner ? <AdminPreviewBanner label={previewLabel} /> : null}
      {showPlanBanner && !onPlanPage ? <ManagerPlanBanner planHref={planHref} /> : null}
    </>
  );
}
