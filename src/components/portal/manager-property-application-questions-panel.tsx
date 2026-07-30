"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ManagerApplicationQuestionsEditorModal } from "@/components/portal/manager-application-questions-editor-modal";
import { PropertyApplicationFormModal } from "@/components/portal/property-application-form-modal";
import {
  PORTAL_LIST_ADD_ICONS,
  PORTAL_LIST_ADD_ROW_WRAP_CLASS,
  PortalListAddRow,
} from "@/components/portal/portal-list-add-row";
import {
  PORTAL_PROPERTY_DETAIL_ACTION_BUTTON_CLASS,
  PORTAL_PROPERTY_DETAIL_LIST_ROW_CLASS,
  PortalPropertyDetailSection,
} from "@/components/portal/portal-property-detail-section";
import {
  normalizeCustomApplicationFields,
  type ManagerListingSubmissionV1,
} from "@/lib/manager-listing-submission";
import { persistManagerListingSubmission } from "@/lib/manager-property-save-target";
import {
  propertyApplicationTypeLabel,
  readPropertyApplicationTemplates,
  removePropertyApplicationTemplate,
  syncLegacyApplicationFieldsFromTemplates,
  type PropertyApplicationTemplate,
} from "@/lib/property-application-templates";
import { submissionAfterRemovingApplicationTemplate, syncPropertyApplicationTemplatesFromListing } from "@/lib/property-application-template-sync";
import { formatApplicationLeaseTermsLabel } from "@/lib/property-lease-template-sync";
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

function applicationQuestionsSummary(
  sub: ManagerListingSubmissionV1,
  template: PropertyApplicationTemplate,
): string {
  const slice = applicationConfigForVariant(sub, template.formVariant);
  const mode = slice.applicationConfigMode === "custom" ? "Custom questions" : "PropLane default";
  const count = resolveListingApplicationFields(slice, normalizeCustomApplicationFields).length;
  return `${count} question${count === 1 ? "" : "s"} · ${mode}`;
}

/**
 * Per-property application templates — same list chrome as the lease tab.
 */
export function ManagerPropertyApplicationQuestionsPanel({
  sub,
  saveTarget,
  managerUserId,
  onUpdated,
  showToast,
  onRegisterAddApplication,
}: {
  sub: ManagerListingSubmissionV1;
  saveTarget: QuestionsSaveTarget;
  managerUserId: string | null;
  onUpdated: () => void;
  showToast: (m: string) => void;
  onRegisterAddApplication?: (openAdd: (() => void) | null) => void;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [questionsModalOpen, setQuestionsModalOpen] = useState(false);
  const [questionsVariant, setQuestionsVariant] = useState<ApplicationFormVariant>("standard");

  const syncedSub = useMemo(() => syncPropertyApplicationTemplatesFromListing(sub), [sub]);
  const templates = useMemo(() => readPropertyApplicationTemplates(syncedSub), [syncedSub]);

  const persistTemplates = (nextTemplates: PropertyApplicationTemplate[]) => {
    if (!saveTarget || !managerUserId) return false;
    const next = syncLegacyApplicationFieldsFromTemplates(syncedSub, nextTemplates);
    return persistManagerListingSubmission(saveTarget, managerUserId, next);
  };

  const openAdd = useCallback(() => {
    setFormMode("add");
    setEditingTemplateId(null);
    setFormOpen(true);
  }, []);

  useEffect(() => {
    onRegisterAddApplication?.(openAdd);
    return () => onRegisterAddApplication?.(null);
  }, [onRegisterAddApplication, openAdd]);

  const openEditQuestions = (template: PropertyApplicationTemplate) => {
    setQuestionsVariant(template.formVariant);
    setQuestionsModalOpen(true);
  };

  const handleRemove = (templateId: string) => {
    if (templates.length <= 1) {
      showToast("Keep at least one application on this property.");
      return;
    }
    if (!window.confirm("Remove this application?")) return;
    const next = removePropertyApplicationTemplate(templates, templateId);
    const persisted = persistManagerListingSubmission(
      saveTarget!,
      managerUserId!,
      submissionAfterRemovingApplicationTemplate(syncedSub, next),
    );
    if (!persisted) {
      showToast("Could not remove application.");
      return;
    }
    onUpdated();
    showToast("Application removed.");
  };

  if (!saveTarget || !managerUserId) return null;

  const editingTemplate = templates.find((t) => t.id === editingTemplateId) ?? null;

  return (
    <>
      <PortalPropertyDetailSection contentClassName="space-y-0">
        {templates.map((template) => (
          <div key={template.id} className={PORTAL_PROPERTY_DETAIL_LIST_ROW_CLASS}>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">{template.label}</p>
              <p className="mt-0.5 text-xs text-muted">
                {propertyApplicationTypeLabel(template.kind)} · {applicationQuestionsSummary(syncedSub, template)}
              </p>
              {formatApplicationLeaseTermsLabel(template.applicationLeaseTerms) ? (
                <p className="mt-0.5 text-xs text-muted">
                  Applicants: {formatApplicationLeaseTermsLabel(template.applicationLeaseTerms)}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                className={PORTAL_PROPERTY_DETAIL_ACTION_BUTTON_CLASS}
                data-attr={`application-stay-open-${template.formVariant}`}
                onClick={() => openEditQuestions(template)}
              >
                Edit
              </Button>
              {templates.length > 1 ? (
                <Button
                  type="button"
                  variant="outline"
                  className={PORTAL_PROPERTY_DETAIL_ACTION_BUTTON_CLASS}
                  data-attr={`application-remove-${template.id}`}
                  onClick={() => handleRemove(template.id)}
                >
                  Remove
                </Button>
              ) : null}
            </div>
          </div>
        ))}
      </PortalPropertyDetailSection>

      <div className={PORTAL_LIST_ADD_ROW_WRAP_CLASS}>
        <PortalListAddRow
          label="Add application"
          icon={PORTAL_LIST_ADD_ICONS.application}
          onClick={openAdd}
          dataAttr="property-application-add"
        />
      </div>

      <PropertyApplicationFormModal
        open={formOpen}
        mode={formMode}
        template={editingTemplate}
        templates={templates}
        onClose={() => {
          setFormOpen(false);
          setEditingTemplateId(null);
        }}
        onSave={(nextTemplates) => {
          if (!persistTemplates(nextTemplates)) {
            showToast("Could not save application.");
            return false;
          }
          onUpdated();
          return true;
        }}
      />

      <ManagerApplicationQuestionsEditorModal
        open={questionsModalOpen}
        initialVariant={questionsVariant}
        lockVariant
        sub={syncedSub}
        saveTarget={saveTarget}
        managerUserId={managerUserId}
        onClose={() => setQuestionsModalOpen(false)}
        onSaved={onUpdated}
        showToast={showToast}
      />
    </>
  );
}
