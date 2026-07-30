"use client";

import type { ReactNode } from "react";
import { ApplicationDocumentPreview } from "@/components/portal/manager-applications";
import { ApplicationScreeningPanel } from "@/components/portal/application-screening-panel";
import { applicationShowsBackgroundCheck } from "@/lib/application-background-check";
import type { DemoApplicantRow } from "@/data/demo-portal";

/**
 * Inline application review on resident / application detail pages.
 * Background checks run and open in modals instead of a separate empty tab.
 */
export function ApplicationReviewLauncherRow({
  row,
  bareCanvas = false,
  showDownload = true,
  onScreeningUpdated,
  onOpenScreeningModal,
  onScreeningHeaderActionsChange,
}: {
  row: DemoApplicantRow;
  bareCanvas?: boolean;
  showDownload?: boolean;
  onScreeningUpdated?: () => void;
  onOpenScreeningModal?: () => void;
  onScreeningHeaderActionsChange?: (actions: ReactNode) => void;
}) {
  const showsScreening = applicationShowsBackgroundCheck(row);

  return (
    <div className="space-y-4" data-slot="application-review-inline">
      <section>
        <ApplicationDocumentPreview row={row} collapsible={false} showDownload={showDownload} bareCanvas={bareCanvas} />
      </section>

      {showsScreening ? (
        <ApplicationScreeningPanel
          row={row}
          collapsible={false}
          presentation="compact"
          bareCanvas={bareCanvas}
          onHeaderActionsChange={onScreeningHeaderActionsChange}
          onUpdated={onScreeningUpdated}
          onOpenScreeningModal={onOpenScreeningModal}
        />
      ) : null}
    </div>
  );
}
