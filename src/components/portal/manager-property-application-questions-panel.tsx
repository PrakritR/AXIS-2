"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ManagerApplicationQuestionsEditorModal } from "@/components/portal/manager-application-questions-editor-modal";
import {
  PORTAL_PROPERTY_DETAIL_ACTION_BUTTON_CLASS,
  PortalPropertyDetailSection,
} from "@/components/portal/portal-property-detail-section";
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
 * Per-property application — long-term and short-term rows open the editor on tap.
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
      <PortalPropertyDetailSection actions={headerActionsExtra} contentClassName="space-y-2 p-3">
          {stayRows.map((row) => (
            <div
              key={row.id}
              className="flex items-start justify-between gap-3 rounded-2xl border border-border bg-card px-3 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{row.label}</p>
                <p className="text-xs text-muted">{row.subtitle}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                className={PORTAL_PROPERTY_DETAIL_ACTION_BUTTON_CLASS}
                data-attr={`application-stay-open-${row.id}`}
                onClick={() => openListModal(row.id)}
              >
                Edit
              </Button>
            </div>
          ))}
      </PortalPropertyDetailSection>

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
