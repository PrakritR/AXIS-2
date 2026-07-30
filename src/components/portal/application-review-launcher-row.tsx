"use client";

import { ApplicationDocumentPreview } from "@/components/portal/manager-applications";
import { ApplicationScreeningPanel } from "@/components/portal/application-screening-panel";
import { applicationShowsBackgroundCheck } from "@/lib/application-background-check";
import type { DemoApplicantRow } from "@/data/demo-portal";

/**
 * Inline application and screening review on resident / application detail pages.
 */
export function ApplicationReviewLauncherRow({
  row,
  onScreeningUpdated,
  onOpenScreeningModal,
}: {
  row: DemoApplicantRow;
  onScreeningUpdated?: () => void;
  onOpenScreeningModal?: () => void;
}) {
  const showsScreening = applicationShowsBackgroundCheck(row);

  return (
    <div className="space-y-6" data-slot="application-review-inline">
      <ApplicationDocumentPreview row={row} collapsible={false} showDownload />
      {showsScreening ? (
        <ApplicationScreeningPanel
          row={row}
          collapsible={false}
          onUpdated={onScreeningUpdated}
          onOpenScreeningModal={onOpenScreeningModal}
        />
      ) : null}
    </div>
  );
}
