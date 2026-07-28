"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { PortalCollapsibleSection } from "@/components/portal/portal-collapsible-section";
import { ManagerApplicationQuestionsEditorModal } from "@/components/portal/manager-application-questions-editor-modal";
import {
  normalizeCustomApplicationFields,
  type ManagerListingSubmissionV1,
} from "@/lib/manager-listing-submission";
import {
  applicationConfigForVariant,
  resolveListingApplicationFields,
  type ApplicationFormVariant,
} from "@/lib/rental-application/application-field-catalog";

type QuestionsSaveTarget =
  | { mode: "pending"; saveId: string }
  | { mode: "listing"; saveId: string }
  | { mode: "requestChange"; saveId: string }
  | null;

const APPLICATION_STAY_ROWS: ReadonlyArray<{
  id: ApplicationFormVariant;
  label: string;
  summary: string;
}> = [
  { id: "standard", label: "Long-term lease", summary: "Standard rental application" },
  { id: "short_term", label: "Short-term stay", summary: "Short-term stay application" },
];

function applicationStaySubtitle(
  variant: ApplicationFormVariant,
  sub: ManagerListingSubmissionV1,
  questionCount: number,
): string {
  const slice = applicationConfigForVariant(sub, variant);
  const mode =
    variant === "short_term"
      ? slice.applicationConfigMode === "custom"
        ? "Custom questions"
        : "PropLane default"
      : slice.applicationConfigMode === "custom"
        ? "Custom questions"
        : "PropLane default";
  return `${questionCount} question${questionCount === 1 ? "" : "s"} · ${mode}`;
}

/**
 * Per-property application — two stay types, same row layout as the Lease section.
 */
export function ManagerPropertyApplicationQuestionsPanel({
  sub,
  saveTarget,
  managerUserId,
  onUpdated,
  showToast,
  headerActionsExtra,
}: {
  sub: ManagerListingSubmissionV1;
  saveTarget: QuestionsSaveTarget;
  managerUserId: string | null;
  onUpdated: () => void;
  showToast: (m: string) => void;
  headerActionsExtra?: ReactNode;
}) {
  const [listModalOpen, setListModalOpen] = useState(false);
  const [listModalVariant, setListModalVariant] = useState<ApplicationFormVariant>("standard");
  const [sectionExpanded, setSectionExpanded] = useState(false);

  const stayRows = useMemo(() => {
    return APPLICATION_STAY_ROWS.map((row) => {
      const slice = applicationConfigForVariant(sub, row.id);
      const count = resolveListingApplicationFields(slice, normalizeCustomApplicationFields).length;
      return {
        ...row,
        questionCount: count,
        subtitle: applicationStaySubtitle(row.id, sub, count),
      };
    });
  }, [sub]);

  if (!saveTarget || !managerUserId) return null;

  const openListModal = (variant: ApplicationFormVariant) => {
    setListModalVariant(variant);
    setListModalOpen(true);
  };

  return (
    <>
      <PortalCollapsibleSection
        title="Application"
        expanded={sectionExpanded}
        onExpandedChange={setSectionExpanded}
        collapsible
        headerActionsInline
        toggleDataAttr="application-section-toggle"
        headerActions={headerActionsExtra}
        contentClassName="px-4 py-2"
      >
        <div className="space-y-2">
          {stayRows.map((row) => (
            <div
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-card px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{row.label}</p>
                <p className="text-xs text-muted">{row.subtitle}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="h-8 shrink-0 rounded-full px-3 text-xs"
                data-attr={`application-stay-edit-${row.id}`}
                onClick={() => openListModal(row.id)}
              >
                Edit
              </Button>
            </div>
          ))}
        </div>
      </PortalCollapsibleSection>

      <ManagerApplicationQuestionsEditorModal
        open={listModalOpen}
        initialVariant={listModalVariant}
        sub={sub}
        saveTarget={saveTarget}
        managerUserId={managerUserId}
        onClose={() => setListModalOpen(false)}
        onSaved={onUpdated}
        showToast={showToast}
      />
    </>
  );
}
