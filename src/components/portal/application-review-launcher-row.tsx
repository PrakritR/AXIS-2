"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ApplicationDocumentPreview } from "@/components/portal/manager-applications";
import { ApplicationScreeningPanel } from "@/components/portal/application-screening-panel";
import {
  ManagerPortalStatusFilterRow,
  ManagerPortalStatusPills,
} from "@/components/portal/portal-metrics";
import { applicationShowsBackgroundCheck } from "@/lib/application-background-check";
import type { DemoApplicantRow } from "@/data/demo-portal";

export type ApplicationReviewSubTab = "application" | "background-check";

/**
 * Inline application and screening review on resident / application detail pages.
 */
export function ApplicationReviewLauncherRow({
  row,
  bareCanvas = false,
  showDownload = true,
  activeSubTab,
  onSubTabChange,
  onScreeningUpdated,
  onOpenScreeningModal,
  onScreeningHeaderActionsChange,
}: {
  row: DemoApplicantRow;
  bareCanvas?: boolean;
  showDownload?: boolean;
  activeSubTab?: ApplicationReviewSubTab;
  onSubTabChange?: (tab: ApplicationReviewSubTab) => void;
  onScreeningUpdated?: () => void;
  onOpenScreeningModal?: () => void;
  onScreeningHeaderActionsChange?: (actions: ReactNode) => void;
}) {
  const showsScreening = applicationShowsBackgroundCheck(row);
  const [internalSubTab, setInternalSubTab] = useState<ApplicationReviewSubTab>("application");
  const subTab = activeSubTab ?? internalSubTab;

  const setSubTab = (next: ApplicationReviewSubTab) => {
    if (activeSubTab === undefined) setInternalSubTab(next);
    onSubTabChange?.(next);
  };

  useEffect(() => {
    if (activeSubTab === undefined) setInternalSubTab("application");
  }, [row.id, activeSubTab]);

  return (
    <div className="space-y-3" data-slot="application-review-inline">
      {showsScreening ? (
        <ManagerPortalStatusFilterRow>
          <ManagerPortalStatusPills
            tabs={[
              { id: "application", label: "Application" },
              { id: "background-check", label: "Background check" },
            ]}
            activeId={subTab}
            onChange={(id) => setSubTab(id as ApplicationReviewSubTab)}
            mobileSelect={false}
            compact
            selectAriaLabel="Application review section"
          />
        </ManagerPortalStatusFilterRow>
      ) : null}

      {!showsScreening || subTab === "application" ? (
        <section>
          <ApplicationDocumentPreview row={row} collapsible={false} showDownload={showDownload} bareCanvas={bareCanvas} />
        </section>
      ) : null}

      {showsScreening && subTab === "background-check" ? (
        <section>
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
