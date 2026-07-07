"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ApplicationQuestionEditModal } from "@/components/portal/application-question-edit-modal";
import { Modal } from "@/components/ui/modal";
import { PortalCollapsibleEditRow } from "@/components/portal/portal-collapsible-edit-row";
import { PortalEditRow } from "@/components/portal/portal-edit-row";
import {
  CUSTOM_APPLICATION_FIELD_TYPE_OPTIONS,
  normalizeCustomApplicationFields,
  type ManagerCustomApplicationFieldType,
  type ManagerListingSubmissionV1,
} from "@/lib/manager-listing-submission";
import {
  applicationConfigFieldsFromSubmission,
  persistApplicationConfigToPropertyIds,
  persistManagerListingSubmission,
  type ManagerPropertySaveTarget,
} from "@/lib/manager-property-save-target";
import {
  removeListingApplicationField,
  resolveListingApplicationFields,
  restoreDefaultApplicationConfig,
  type ResolvedApplicationField,
} from "@/lib/rental-application/application-field-catalog";
import { RENTAL_APPLICATION_SECTIONS } from "@/lib/rental-application/application-sections";

function typeLabel(type: ManagerCustomApplicationFieldType): string {
  return CUSTOM_APPLICATION_FIELD_TYPE_OPTIONS.find((o) => o.id === type)?.label ?? type;
}

export { typeLabel as applicationQuestionTypeLabel };

function applyFieldRemovals(
  sub: ManagerListingSubmissionV1,
  fields: ResolvedApplicationField[],
): ManagerListingSubmissionV1 {
  return fields.reduce(
    (acc, field) => ({ ...acc, ...removeListingApplicationField(acc, field) }),
    sub,
  );
}

function questionSubtitle(field: ResolvedApplicationField): string {
  return `${field.isStandard ? "Built-in" : "Custom"} · ${typeLabel(field.type)}${field.required ? " · Required" : " · Optional"}`;
}

function persistApplicationConfig({
  next,
  saveTarget,
  propertyIds,
  managerUserId,
  showToast,
  singleSuccessMessage,
}: {
  next: ManagerListingSubmissionV1;
  saveTarget?: ManagerPropertySaveTarget;
  propertyIds?: string[];
  managerUserId: string;
  showToast: (m: string) => void;
  singleSuccessMessage: string;
}): boolean {
  const bulkIds = propertyIds?.filter((id) => id.trim()) ?? [];
  if (bulkIds.length > 0) {
    const { saved, failed } = persistApplicationConfigToPropertyIds(
      managerUserId,
      bulkIds,
      applicationConfigFieldsFromSubmission(next),
    );
    if (saved === 0) {
      showToast("Could not save application settings.");
      return false;
    }
    if (failed > 0) {
      showToast(`Updated application for ${saved} properties (${failed} could not be saved).`);
    } else if (saved === 1) {
      showToast(singleSuccessMessage);
    } else {
      showToast(`Updated application for ${saved} properties`);
    }
    return true;
  }

  if (!saveTarget) {
    showToast("Could not save application settings.");
    return false;
  }
  if (!persistManagerListingSubmission(saveTarget, managerUserId, next)) {
    showToast("Could not save application settings.");
    return false;
  }
  showToast(singleSuccessMessage);
  return true;
}

/** Shared application-question editor — same modal used on property details and Applications. */
export function ManagerApplicationQuestionsEditorModal({
  open,
  title = "Application",
  sub,
  saveTarget,
  propertyIds,
  managerUserId,
  onClose,
  onSaved,
  showToast,
}: {
  open: boolean;
  title?: string;
  sub: ManagerListingSubmissionV1;
  saveTarget?: ManagerPropertySaveTarget;
  /** When set, each save applies the same application config to every id (bulk edit). */
  propertyIds?: string[];
  managerUserId: string;
  onClose: () => void;
  onSaved: () => void;
  showToast: (m: string) => void;
}) {
  const [localSub, setLocalSub] = useState(sub);
  const [expandedSectionId, setExpandedSectionId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editingField, setEditingField] = useState<ResolvedApplicationField | null>(null);
  const [isNewField, setIsNewField] = useState(false);
  const [newFieldSectionId, setNewFieldSectionId] = useState("additional");

  useEffect(() => {
    if (!open) return;
    setLocalSub(sub);
    setExpandedSectionId(null);
    setEditOpen(false);
    setEditingField(null);
    setIsNewField(false);
  }, [open, sub]);

  const bulkIds = propertyIds?.filter((id) => id.trim()) ?? [];
  const isBulkSave = bulkIds.length > 0;

  const applicationFields = useMemo(
    () => resolveListingApplicationFields(localSub, normalizeCustomApplicationFields),
    [localSub],
  );

  const openEdit = (field: ResolvedApplicationField) => {
    setEditingField(field);
    setIsNewField(false);
    setEditOpen(true);
  };

  const openAdd = (sectionId: string) => {
    setEditingField(null);
    setIsNewField(true);
    setNewFieldSectionId(sectionId);
    setEditOpen(true);
    setExpandedSectionId(sectionId);
  };

  const closeEdit = () => {
    setEditOpen(false);
    setEditingField(null);
    setIsNewField(false);
  };

  const removeField = (field: ResolvedApplicationField) => {
    const next: ManagerListingSubmissionV1 = { ...localSub, ...removeListingApplicationField(localSub, field) };
    if (
      !persistApplicationConfig({
        next,
        saveTarget,
        propertyIds: isBulkSave ? bulkIds : undefined,
        managerUserId,
        showToast,
        singleSuccessMessage: "Question removed.",
      })
    ) {
      return;
    }
    setLocalSub(next);
    onSaved();
  };

  const removeSection = (sectionId: string) => {
    const sectionQuestions = applicationFields.filter((f) => (f.section ?? "additional") === sectionId);
    if (sectionQuestions.length === 0) return;
    const next = applyFieldRemovals(localSub, sectionQuestions);
    if (
      !persistApplicationConfig({
        next,
        saveTarget,
        propertyIds: isBulkSave ? bulkIds : undefined,
        managerUserId,
        showToast,
        singleSuccessMessage: "Section questions removed.",
      })
    ) {
      return;
    }
    setLocalSub(next);
    if (expandedSectionId === sectionId) setExpandedSectionId(null);
    onSaved();
  };

  const restoreDefaults = () => {
    const next: ManagerListingSubmissionV1 = { ...localSub, ...restoreDefaultApplicationConfig() };
    if (
      !persistApplicationConfig({
        next,
        saveTarget,
        propertyIds: isBulkSave ? bulkIds : undefined,
        managerUserId,
        showToast,
        singleSuccessMessage: "Application restored to Axis defaults.",
      })
    ) {
      return;
    }
    setLocalSub(next);
    setExpandedSectionId(null);
    onSaved();
  };

  const onQuestionSaved = (next: ManagerListingSubmissionV1) => {
    setLocalSub(next);
    onSaved();
  };

  return (
    <>
      <Modal open={open} title={title} onClose={onClose} panelClassName="max-w-2xl">
        {isBulkSave ? (
          <p className="mb-4 text-sm text-muted">
            These settings apply to all {bulkIds.length} selected properties. Existing per-property differences are
            replaced when you save changes.
          </p>
        ) : null}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted">
              {applicationFields.length} question{applicationFields.length === 1 ? "" : "s"} on this application
            </p>
            <Button type="button" variant="outline" className="h-8 rounded-full px-3 text-xs" onClick={restoreDefaults}>
              Restore Axis defaults
            </Button>
          </div>

          {RENTAL_APPLICATION_SECTIONS.map((section) => {
            const sectionQuestions = applicationFields.filter((f) => (f.section ?? "additional") === section.id);
            const sectionExpanded = expandedSectionId === section.id;
            return (
              <PortalCollapsibleEditRow
                key={section.id}
                title={section.title}
                titleVariant="label"
                subtitle={
                  sectionQuestions.length === 0
                    ? "No questions in this section"
                    : `${sectionQuestions.length} question${sectionQuestions.length === 1 ? "" : "s"}`
                }
                expanded={sectionExpanded}
                onExpandedChange={(next) => setExpandedSectionId(next ? section.id : null)}
                toggleDataAttr={`application-section-toggle-${section.id}`}
                onRemove={sectionQuestions.length > 0 ? () => removeSection(section.id) : undefined}
                removeTitle={`Remove all questions in ${section.title}`}
                removeDataAttr="application-section-remove"
                headerActions={
                  <Button
                    type="button"
                    variant="outline"
                    className="h-7 rounded-full px-2.5 text-xs"
                    data-attr="application-questions-add"
                    onClick={() => openAdd(section.id)}
                  >
                    + Add question
                  </Button>
                }
              >
                {sectionQuestions.length === 0 ? (
                  <p className="text-sm text-muted">No questions in this section yet.</p>
                ) : (
                  <div className="space-y-2">
                    {sectionQuestions.map((field) => (
                      <PortalEditRow
                        key={field.id}
                        title={field.label.trim() || "Untitled question"}
                        subtitle={questionSubtitle(field)}
                        clickDataAttr={`application-question-edit-${field.id}`}
                        onClick={() => openEdit(field)}
                        onRemove={() => removeField(field)}
                        removeTitle="Remove question"
                        removeDataAttr="application-question-remove"
                      />
                    ))}
                  </div>
                )}
              </PortalCollapsibleEditRow>
            );
          })}
        </div>
        <div className="mt-4">
          <Button type="button" variant="outline" className="rounded-full" onClick={onClose}>
            Close
          </Button>
        </div>
      </Modal>

      <ApplicationQuestionEditModal
        open={editOpen}
        field={editingField}
        isNew={isNewField}
        sectionId={newFieldSectionId}
        sub={localSub}
        saveTarget={saveTarget}
        propertyIds={isBulkSave ? bulkIds : undefined}
        managerUserId={managerUserId}
        onClose={closeEdit}
        onSaved={onQuestionSaved}
        showToast={showToast}
      />
    </>
  );
}
