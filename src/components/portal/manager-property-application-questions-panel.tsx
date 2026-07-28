"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ApplicationQuestionEditModal } from "@/components/portal/application-question-edit-modal";
import { PortalCollapsibleSection } from "@/components/portal/portal-collapsible-section";
import { PillTabs } from "@/components/ui/tabs";
import {
  ManagerApplicationQuestionsEditorModal,
  applicationQuestionTypeLabel,
} from "@/components/portal/manager-application-questions-editor-modal";
import {
  normalizeCustomApplicationFields,
  type ManagerListingSubmissionV1,
} from "@/lib/manager-listing-submission";
import { persistManagerListingSubmission } from "@/lib/manager-property-save-target";
import {
  applicationConfigForVariant,
  removeListingApplicationField,
  resolveListingApplicationFields,
  mergeApplicationConfigForVariant,
  type ApplicationFormVariant,
  type ResolvedApplicationField,
} from "@/lib/rental-application/application-field-catalog";
import { RENTAL_APPLICATION_SECTIONS } from "@/lib/rental-application/application-sections";

type QuestionsSaveTarget =
  | { mode: "pending"; saveId: string }
  | { mode: "listing"; saveId: string }
  | { mode: "requestChange"; saveId: string }
  | null;

const STAY_VARIANT_TABS: { id: ApplicationFormVariant; label: string }[] = [
  { id: "standard", label: "Long-term lease" },
  { id: "short_term", label: "Short-term stay" },
];

function shortenOptions(options: string[], max = 3): string {
  if (options.length === 0) return "";
  if (options.length <= max) return options.join(" / ");
  return `${options.slice(0, max).join(" / ")} +${options.length - max} more`;
}

function questionSubtitle(field: ResolvedApplicationField): string {
  return [
    applicationQuestionTypeLabel(field.type),
    field.required ? "Required" : "Optional",
    field.type === "select" && field.options.length > 0 ? shortenOptions(field.options) : null,
    field.isStandard ? "Built-in" : "Custom",
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Per-property application editor — long-term vs short-term stay forms, with
 * lease-style rows and modals for edit.
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
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [stayVariant, setStayVariant] = useState<ApplicationFormVariant>("standard");
  const [editOpen, setEditOpen] = useState(false);
  const [editingField, setEditingField] = useState<ResolvedApplicationField | null>(null);

  const configSlice = useMemo(
    () => applicationConfigForVariant(sub, stayVariant),
    [sub, stayVariant],
  );

  const applicationFields = useMemo(
    () => resolveListingApplicationFields(configSlice, normalizeCustomApplicationFields),
    [configSlice],
  );
  const hasPreview = applicationFields.length > 0;

  if (!saveTarget || !managerUserId) return null;

  const openListModal = (variant: ApplicationFormVariant) => {
    setListModalVariant(variant);
    setListModalOpen(true);
  };

  const openFieldEdit = (field: ResolvedApplicationField) => {
    setEditingField(field);
    setEditOpen(true);
  };

  const closeFieldEdit = () => {
    setEditOpen(false);
    setEditingField(null);
  };

  const removeField = (field: ResolvedApplicationField) => {
    const patch = removeListingApplicationField(configSlice, field);
    const nextSlice =
      stayVariant === "short_term" ? { ...patch, applicationConfigMode: "custom" as const } : patch;
    const next: ManagerListingSubmissionV1 = {
      ...sub,
      ...mergeApplicationConfigForVariant(stayVariant, nextSlice),
    };
    if (!persistManagerListingSubmission(saveTarget, managerUserId, next)) {
      showToast("Could not remove question.");
      return;
    }
    showToast("Question removed.");
    onUpdated();
  };

  return (
    <>
      <PortalCollapsibleSection
        title="Application"
        expanded={previewExpanded}
        onExpandedChange={setPreviewExpanded}
        collapsible
        headerActionsInline
        toggleDataAttr="application-section-toggle"
        headerActions={
          <>
            {headerActionsExtra}
            <Button
              type="button"
              variant="outline"
              className="h-8 rounded-full px-3 text-xs"
              data-attr="application-questions-edit"
              onClick={(e) => {
                e.stopPropagation();
                openListModal(stayVariant);
              }}
            >
              Edit
            </Button>
          </>
        }
        contentClassName="max-h-[min(50vh,420px)] overflow-y-auto overscroll-contain px-4 py-3"
      >
        <div className="mb-4">
          <PillTabs
            items={STAY_VARIANT_TABS}
            activeId={stayVariant}
            onChange={(id) => setStayVariant(id as ApplicationFormVariant)}
          />
        </div>

        <div className="mb-4 space-y-2">
          {STAY_VARIANT_TABS.map((tab) => {
            const slice = applicationConfigForVariant(sub, tab.id);
            const count = resolveListingApplicationFields(slice, normalizeCustomApplicationFields).length;
            return (
              <div
                key={tab.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-card px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{tab.label}</p>
                  <p className="text-xs text-muted">
                    {count} question{count === 1 ? "" : "s"} · Opens full editor
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 rounded-full px-3 text-xs"
                  data-attr={`application-stay-edit-${tab.id}`}
                  onClick={() => openListModal(tab.id)}
                >
                  Edit
                </Button>
              </div>
            );
          })}
        </div>

        {hasPreview ? (
          <div className="space-y-2">
            {RENTAL_APPLICATION_SECTIONS.map((section) => {
              const sectionQuestions = applicationFields.filter(
                (f) => (f.section ?? "additional") === section.id,
              );
              if (sectionQuestions.length === 0) return null;
              return (
                <div key={section.id} className="space-y-2">
                  <p className="px-1 text-xs font-bold uppercase tracking-[0.12em] text-muted">
                    {section.title}
                  </p>
                  {sectionQuestions.map((field) => (
                    <div
                      key={field.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-card px-3 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">{field.label}</p>
                        <p className="text-xs text-muted">{questionSubtitle(field)}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          className="h-8 rounded-full px-3 text-xs"
                          data-attr={`application-preview-edit-${field.id}`}
                          onClick={() => openFieldEdit(field)}
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-8 rounded-full px-3 text-xs"
                          data-attr="application-question-remove-one"
                          onClick={() => removeField(field)}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted">No questions in this stay type yet. Use Edit to add or restore defaults.</p>
        )}
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

      <ApplicationQuestionEditModal
        open={editOpen}
        field={editingField}
        variant={stayVariant}
        sub={sub}
        saveTarget={saveTarget}
        managerUserId={managerUserId}
        onClose={closeFieldEdit}
        onSaved={onUpdated}
        showToast={showToast}
      />
    </>
  );
}
