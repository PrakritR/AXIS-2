"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
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
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {headerActionsExtra ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-b border-border bg-accent/30 px-4 py-2.5">
            <div className="flex shrink-0 items-center gap-2">{headerActionsExtra}</div>
          </div>
        ) : null}
        <div className="space-y-2 p-3">
          {stayRows.map((row) => (
            <button
              key={row.id}
              type="button"
              className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-card px-3 py-3 text-left transition hover:bg-accent/25 active:bg-accent/40"
              data-attr={`application-stay-open-${row.id}`}
              onClick={() => openListModal(row.id)}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{row.label}</p>
                <p className="text-xs text-muted">{row.subtitle}</p>
              </div>
              <span className="shrink-0 text-xs font-semibold text-primary">Edit</span>
            </button>
          ))}
        </div>
      </div>

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
