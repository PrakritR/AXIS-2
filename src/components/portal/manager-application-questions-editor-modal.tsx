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
  applicationConfigForVariant,
  mergeApplicationConfigForVariant,
  reenableListingApplicationField,
  removeListingApplicationField,
  resolveDisabledStandardApplicationFields,
  resolveListingApplicationFields,
  restoreDefaultApplicationConfig,
  type ApplicationConfigSlice,
  type ApplicationFormVariant,
  type ResolvedApplicationField,
} from "@/lib/rental-application/application-field-catalog";
import { RENTAL_APPLICATION_SECTIONS } from "@/lib/rental-application/application-sections";

const APPLICATION_FORM_VARIANTS: ReadonlyArray<{ id: ApplicationFormVariant; label: string; hint: string }> = [
  { id: "standard", label: "Long-term lease", hint: "The full application for standard leases." },
  {
    id: "short_term",
    label: "Short-term stay",
    hint: "A shorter guest application for short-term stays — configured separately.",
  },
];

function typeLabel(type: ManagerCustomApplicationFieldType): string {
  return CUSTOM_APPLICATION_FIELD_TYPE_OPTIONS.find((o) => o.id === type)?.label ?? type;
}

export { typeLabel as applicationQuestionTypeLabel };

function applyFieldRemovals(
  slice: ApplicationConfigSlice,
  fields: ResolvedApplicationField[],
): ApplicationConfigSlice {
  return fields.reduce((acc, field) => removeListingApplicationField(acc, field), slice);
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
  const [variant, setVariant] = useState<ApplicationFormVariant>("standard");
  const [expandedSectionId, setExpandedSectionId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editingField, setEditingField] = useState<ResolvedApplicationField | null>(null);
  const [isNewField, setIsNewField] = useState(false);
  const [newFieldSectionId, setNewFieldSectionId] = useState("additional");

  useEffect(() => {
    if (!open) return;
    setLocalSub(sub);
    setVariant("standard");
    setExpandedSectionId(null);
    setEditOpen(false);
    setEditingField(null);
    setIsNewField(false);
  }, [open, sub]);

  const bulkIds = propertyIds?.filter((id) => id.trim()) ?? [];
  const isBulkSave = bulkIds.length > 0;

  // The config slice for the form the manager is editing. Long-term reads the
  // top-level triplet; short-term reads its own, defaulting to PropLane's
  // curated short-term question set until edited. Edits to one never touch the
  // other.
  const configSlice = useMemo(() => applicationConfigForVariant(localSub, variant), [localSub, variant]);

  const applicationFields = useMemo(
    () => resolveListingApplicationFields(configSlice, normalizeCustomApplicationFields),
    [configSlice],
  );
  const disabledFields = useMemo(() => resolveDisabledStandardApplicationFields(configSlice), [configSlice]);

  const persistSlice = (nextSlice: ApplicationConfigSlice, singleSuccessMessage: string): boolean => {
    const next: ManagerListingSubmissionV1 = {
      ...localSub,
      ...mergeApplicationConfigForVariant(variant, nextSlice),
    };
    if (
      !persistApplicationConfig({
        next,
        saveTarget,
        propertyIds: isBulkSave ? bulkIds : undefined,
        managerUserId,
        showToast,
        singleSuccessMessage,
      })
    ) {
      return false;
    }
    setLocalSub(next);
    return true;
  };

  // An EDIT to the short-term form must STICK even when it leaves the slice
  // empty — e.g. re-enabling every off-by-default built-in, or deleting the last
  // custom question after doing so. `applicationConfigForVariant` treats a
  // non-"custom" short-term slice as the curated DEFAULT, so a mode that
  // collapsed to "standard" would silently revert the manager's choices. Pin
  // "custom" on edits; only "Restore PropLane defaults" (plain `persistSlice`
  // with a fresh default) intentionally returns short-term to the curated set.
  const persistEditedSlice = (nextSlice: ApplicationConfigSlice, singleSuccessMessage: string): boolean =>
    persistSlice(
      variant === "short_term" ? { ...nextSlice, applicationConfigMode: "custom" } : nextSlice,
      singleSuccessMessage,
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
    if (!persistEditedSlice(removeListingApplicationField(configSlice, field), "Question removed.")) return;
    onSaved();
  };

  const reenableField = (field: ResolvedApplicationField) => {
    if (!field.standardKey) return;
    if (!persistEditedSlice(reenableListingApplicationField(configSlice, field.standardKey), "Question added back.")) return;
    onSaved();
  };

  const removeSection = (sectionId: string) => {
    const sectionQuestions = applicationFields.filter((f) => (f.section ?? "additional") === sectionId);
    if (sectionQuestions.length === 0) return;
    if (!persistEditedSlice(applyFieldRemovals(configSlice, sectionQuestions), "Section questions removed.")) return;
    if (expandedSectionId === sectionId) setExpandedSectionId(null);
    onSaved();
  };

  const restoreDefaults = () => {
    if (
      !persistSlice(
        restoreDefaultApplicationConfig(),
        variant === "short_term"
          ? "Short-term application restored to PropLane defaults."
          : "Application restored to PropLane defaults.",
      )
    ) {
      return;
    }
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
          {/*
            Two separate applications, edited independently. The tabs pick which
            one these controls configure; turning a question off in one never
            affects the other (they persist to different submission fields).
          */}
          <div
            className="flex gap-1 rounded-full border border-border bg-accent/30 p-1"
            role="tablist"
            aria-label="Application form"
          >
            {APPLICATION_FORM_VARIANTS.map((v) => {
              const active = variant === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  title={v.hint}
                  data-attr={`application-variant-tab-${v.id}`}
                  onClick={() => {
                    setVariant(v.id);
                    setExpandedSectionId(null);
                  }}
                  className={`flex-1 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    active
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  {v.label}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted">
              {applicationFields.length} question{applicationFields.length === 1 ? "" : "s"} on the{" "}
              {variant === "short_term" ? "short-term" : "long-term"} application
            </p>
            <Button type="button" variant="outline" className="h-8 rounded-full px-3 text-xs" onClick={restoreDefaults}>
              Restore PropLane defaults
            </Button>
          </div>

          {RENTAL_APPLICATION_SECTIONS.map((section) => {
            const sectionQuestions = applicationFields.filter((f) => (f.section ?? "additional") === section.id);
            const sectionDisabled = disabledFields.filter((f) => (f.section ?? "additional") === section.id);
            const sectionExpanded = expandedSectionId === section.id;
            return (
              <PortalCollapsibleEditRow
                key={section.id}
                title={section.title}
                titleVariant="label"
                subtitle={
                  sectionQuestions.length === 0
                    ? sectionDisabled.length > 0
                      ? `${sectionDisabled.length} question${sectionDisabled.length === 1 ? "" : "s"} off`
                      : "No questions in this section"
                    : `${sectionQuestions.length} question${sectionQuestions.length === 1 ? "" : "s"}${
                        sectionDisabled.length > 0 ? ` · ${sectionDisabled.length} off` : ""
                      }`
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
                {sectionQuestions.length === 0 && sectionDisabled.length === 0 ? (
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
                    {sectionDisabled.map((field) => (
                      <div
                        key={field.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-border bg-accent/20 px-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm text-muted line-through">
                            {field.label.trim() || "Untitled question"}
                          </p>
                          <p className="text-xs text-muted/80">Off · not asked on this application</p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-7 shrink-0 rounded-full px-2.5 text-xs"
                          data-attr="application-question-reenable"
                          onClick={() => reenableField(field)}
                        >
                          Add back
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </PortalCollapsibleEditRow>
            );
          })}
        </div>
      </Modal>

      <ApplicationQuestionEditModal
        open={editOpen}
        field={editingField}
        isNew={isNewField}
        sectionId={newFieldSectionId}
        sub={localSub}
        variant={variant}
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
