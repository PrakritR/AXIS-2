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
import {
  persistManagerListingSubmission,
  resolveManagerListingSubmissionForPropertyId,
} from "@/lib/manager-property-save-target";
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
  propertyIds,
  onUpdated,
  showToast,
  onRegisterAddApplication,
}: {
  sub: ManagerListingSubmissionV1;
  saveTarget: QuestionsSaveTarget;
  managerUserId: string | null;
  /** When set, template changes apply to every listed property (bulk edit). */
  propertyIds?: string[];
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

  const bulkPropertyIds = propertyIds?.filter((id) => id.trim()) ?? [];

  const persistTemplates = (nextTemplates: PropertyApplicationTemplate[]) => {
    if (!managerUserId) return false;

    if (bulkPropertyIds.length > 0) {
      let saved = 0;
      let failed = 0;
      for (const propertyId of bulkPropertyIds) {
        const hit = resolveManagerListingSubmissionForPropertyId(managerUserId, propertyId);
        if (!hit) {
          failed += 1;
          continue;
        }
        const base = syncPropertyApplicationTemplatesFromListing(hit.sub);
        const next = syncLegacyApplicationFieldsFromTemplates(base, nextTemplates);
        if (persistManagerListingSubmission(hit.saveTarget, managerUserId, next)) saved += 1;
        else failed += 1;
      }
      if (saved === 0) {
        showToast("Could not save application settings.");
        return false;
      }
      if (failed > 0) {
        showToast(`Updated application for ${saved} properties (${failed} could not be saved).`);
      } else if (saved > 1) {
        showToast(`Updated application for ${saved} properties.`);
      }
      return true;
    }

    if (!saveTarget) return false;
    const next = syncLegacyApplicationFieldsFromTemplates(syncedSub, nextTemplates);
    return persistManagerListingSubmission(saveTarget, managerUserId, next);
  };

  const persistRemoval = (nextTemplates: PropertyApplicationTemplate[]) => {
    if (!managerUserId) return false;

    if (bulkPropertyIds.length > 0) {
      let saved = 0;
      let failed = 0;
      for (const propertyId of bulkPropertyIds) {
        const hit = resolveManagerListingSubmissionForPropertyId(managerUserId, propertyId);
        if (!hit) {
          failed += 1;
          continue;
        }
        const base = syncPropertyApplicationTemplatesFromListing(hit.sub);
        const persisted = persistManagerListingSubmission(
          hit.saveTarget,
          managerUserId,
          submissionAfterRemovingApplicationTemplate(base, nextTemplates),
        );
        if (persisted) saved += 1;
        else failed += 1;
      }
      return saved > 0;
    }

    if (!saveTarget) return false;
    return persistManagerListingSubmission(
      saveTarget,
      managerUserId,
      submissionAfterRemovingApplicationTemplate(syncedSub, nextTemplates),
    );
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
    const persisted = persistRemoval(next);
    if (!persisted) {
      showToast("Could not remove application.");
      return;
    }
    onUpdated();
    showToast("Application removed.");
  };

  if (!managerUserId || (!saveTarget && bulkPropertyIds.length === 0)) return null;

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
        saveTarget={saveTarget ?? undefined}
        propertyIds={bulkPropertyIds.length > 0 ? bulkPropertyIds : undefined}
        managerUserId={managerUserId}
        onClose={() => setQuestionsModalOpen(false)}
        onSaved={onUpdated}
        showToast={showToast}
      />
    </>
  );
}
