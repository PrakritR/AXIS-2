"use client";

import type { ReactNode } from "react";
import { ApplicationDocumentPreview } from "@/components/portal/manager-applications";
import { ApplicationScreeningPanel } from "@/components/portal/application-screening-panel";
import { applicationShowsBackgroundCheck } from "@/lib/application-background-check";
import type { DemoApplicantRow } from "@/data/demo-portal";

const SECTION_HEADING_CLASS = "text-[10px] font-bold uppercase tracking-[0.14em] text-muted";

/**
 * Inline application and screening review on resident / application detail pages.
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
    <div
      className={showsScreening ? "grid gap-8 md:grid-cols-2 md:items-start md:gap-6" : "space-y-8"}
      data-slot="application-review-inline"
    >
      <section className="space-y-3">
        <h2 className={SECTION_HEADING_CLASS}>Application</h2>
        <ApplicationDocumentPreview row={row} collapsible={false} showDownload={showDownload} bareCanvas={bareCanvas} />
      </section>
      {showsScreening ? (
        <section className="space-y-3">
          <h2 className={SECTION_HEADING_CLASS}>Background check</h2>
          <ApplicationScreeningPanel
            row={row}
            collapsible={false}
            bareCanvas={bareCanvas}
            headerActionsPlacement="parent"
            onHeaderActionsChange={onScreeningHeaderActionsChange}
            onUpdated={onScreeningUpdated}
            onOpenScreeningModal={onOpenScreeningModal}
          />
        </section>
      ) : null}
    </div>
  );
}
