"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ApplicationQuestionEditModal } from "@/components/portal/application-question-edit-modal";
import { PortalCollapsibleSection } from "@/components/portal/portal-collapsible-section";
import { PortalEditRow } from "@/components/portal/portal-edit-row";
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
  removeListingApplicationField,
  resolveListingApplicationFields,
  type ResolvedApplicationField,
} from "@/lib/rental-application/application-field-catalog";
import { RENTAL_APPLICATION_SECTIONS } from "@/lib/rental-application/application-sections";

type QuestionsSaveTarget =
  | { mode: "pending"; saveId: string }
  | { mode: "listing"; saveId: string }
  | { mode: "requestChange"; saveId: string }
  | null;

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
 * Per-property application editor — custom questions applicants answer in the
 * rental application (Additional details step). Stored on the listing submission
 * (`customApplicationFields`) so they persist with the property record.
 */
export function ManagerPropertyApplicationQuestionsPanel({
  sub,
  saveTarget,
  managerUserId,
  onUpdated,
  showToast,
}: {
  sub: ManagerListingSubmissionV1;
  saveTarget: QuestionsSaveTarget;
  managerUserId: string | null;
  onUpdated: () => void;
  showToast: (m: string) => void;
}) {
  const [listModalOpen, setListModalOpen] = useState(false);
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingField, setEditingField] = useState<ResolvedApplicationField | null>(null);

  const applicationFields = useMemo(
    () => resolveListingApplicationFields(sub, normalizeCustomApplicationFields),
    [sub],
  );
  const hasPreview = applicationFields.length > 0;

  if (!saveTarget || !managerUserId) return null;

  const openEdit = (field: ResolvedApplicationField) => {
    setEditingField(field);
    setEditOpen(true);
  };

  const closeEdit = () => {
    setEditOpen(false);
    setEditingField(null);
  };

  const removeField = (field: ResolvedApplicationField) => {
    const patch = removeListingApplicationField(sub, field);
    const next: ManagerListingSubmissionV1 = { ...sub, ...patch };
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
        collapsible={hasPreview}
        toggleDataAttr="application-section-toggle"
        headerActions={
          <Button
            type="button"
            variant="outline"
            className="h-8 rounded-full px-3 text-xs"
            data-attr="application-questions-add"
            onClick={() => setListModalOpen(true)}
          >
            Edit
          </Button>
        }
        contentClassName="max-h-[min(50vh,420px)] overflow-y-auto overscroll-contain px-4 py-3"
      >
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
                    <PortalEditRow
                      key={field.id}
                      title={field.label}
                      subtitle={questionSubtitle(field)}
                      clickDataAttr={`application-preview-edit-${field.id}`}
                      onClick={() => openEdit(field)}
                      onRemove={() => removeField(field)}
                      removeTitle={`Remove ${field.label}`}
                      removeDataAttr="application-question-remove-one"
                    />
                  ))}
                </div>
              );
            })}
          </div>
        ) : null}
      </PortalCollapsibleSection>

      <ManagerApplicationQuestionsEditorModal
        open={listModalOpen}
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
        sub={sub}
        saveTarget={saveTarget}
        managerUserId={managerUserId}
        onClose={closeEdit}
        onSaved={onUpdated}
        showToast={showToast}
      />
    </>
  );
}
