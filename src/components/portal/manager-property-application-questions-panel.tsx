"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RentalApplicationWizard } from "@/components/marketing/rental-application-wizard";
import { CosignerApplyFlow } from "@/app/(public)/rent/apply/cosigner-flow";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ManagerApplicationQuestionsEditorModal } from "@/components/portal/manager-application-questions-editor-modal";
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
  type ManagerListingSubmissionV1,
} from "@/lib/manager-listing-submission";
import {
  applicationConfigFieldsFromSubmission,
  persistManagerListingSubmission,
  resolveManagerListingSubmissionForPropertyId,
} from "@/lib/manager-property-save-target";
import {
  readPropertyApplicationTemplates,
  removePropertyApplicationTemplate,
  syncLegacyApplicationFieldsFromTemplates,
  type PropertyApplicationTemplate,
} from "@/lib/property-application-templates";
import { submissionAfterRemovingApplicationTemplate, syncPropertyApplicationTemplatesFromListing } from "@/lib/property-application-template-sync";
import { formatApplicationLeaseTermsLabel } from "@/lib/property-lease-template-sync";

type QuestionsSaveTarget =
  | { mode: "pending"; saveId: string }
  | { mode: "listing"; saveId: string }
  | { mode: "requestChange"; saveId: string }
  | null;

function isManagerOwnedApplicationTemplate(template: PropertyApplicationTemplate): boolean {
  return !template.listingSeedKey;
}

/**
 * Per-property application templates — same list chrome as the lease tab.
 */
export function ManagerPropertyApplicationQuestionsPanel({
  sub,
  saveTarget,
  managerUserId,
  propertyIds,
  listingId,
  onUpdated,
  showToast,
  onRegisterAddApplication,
}: {
  sub: ManagerListingSubmissionV1;
  saveTarget: QuestionsSaveTarget;
  managerUserId: string | null;
  /** When set, template changes apply to every listed property (bulk edit). */
  propertyIds?: string[];
  /** Live listing id — used for the in-portal application preview. */
  listingId?: string | null;
  onUpdated: () => void;
  showToast: (m: string) => void;
  onRegisterAddApplication?: (openAdd: (() => void) | null) => void;
}) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"add" | "edit">("edit");
  const [editingTemplate, setEditingTemplate] = useState<PropertyApplicationTemplate | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<PropertyApplicationTemplate | null>(null);

  const syncedSub = useMemo(() => syncPropertyApplicationTemplatesFromListing(sub), [sub]);
  const templates = useMemo(() => readPropertyApplicationTemplates(syncedSub), [syncedSub]);

  const bulkPropertyIds = propertyIds?.filter((id) => id.trim()) ?? [];

  const persistSubmission = useCallback(
    (merged: ManagerListingSubmissionV1, opts: { message: string }) => {
      if (!managerUserId) return false;

      if (bulkPropertyIds.length > 0) {
        const configFields = applicationConfigFieldsFromSubmission(merged);
        const nextTemplates = readPropertyApplicationTemplates(merged);
        let saved = 0;
        let failed = 0;
        for (const propertyId of bulkPropertyIds) {
          const hit = resolveManagerListingSubmissionForPropertyId(managerUserId, propertyId);
          if (!hit) {
            failed += 1;
            continue;
          }
          const base = syncPropertyApplicationTemplatesFromListing(hit.sub);
          const next = syncLegacyApplicationFieldsFromTemplates({ ...base, ...configFields }, nextTemplates);
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
        } else {
          showToast(opts.message);
        }
        return true;
      }

      if (!saveTarget) return false;
      if (!persistManagerListingSubmission(saveTarget, managerUserId, merged)) {
        showToast("Could not save application settings.");
        return false;
      }
      showToast(opts.message);
      return true;
    },
    [bulkPropertyIds, managerUserId, saveTarget, showToast],
  );

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
    setEditorMode("add");
    setEditingTemplate(null);
    setEditorOpen(true);
  }, []);

  useEffect(() => {
    onRegisterAddApplication?.(openAdd);
    return () => onRegisterAddApplication?.(null);
  }, [onRegisterAddApplication, openAdd]);

  const openApplicationPreview = (template: PropertyApplicationTemplate) => {
    const pid = listingId?.trim();
    if (!pid) {
      showToast("Publish this listing before previewing the application.");
      return;
    }
    setPreviewTemplate(template);
    setPreviewOpen(true);
  };

  const openEditApplication = (template: PropertyApplicationTemplate) => {
    setEditorMode("edit");
    setEditingTemplate(template);
    setEditorOpen(true);
  };

  const handleDeleteTemplate = (templateId: string, label: string) => {
    if (templates.length <= 1) {
      showToast("Keep at least one application on this property.");
      return;
    }
    const target = templates.find((t) => t.id === templateId);
    if (target && !isManagerOwnedApplicationTemplate(target)) {
      showToast("Long-term and short-term defaults cannot be removed.");
      return;
    }
    const next = removePropertyApplicationTemplate(templates, templateId);
    const persisted = persistRemoval(next);
    if (!persisted) {
      showToast("Could not delete application.");
      return;
    }
    setEditorOpen(false);
    setPreviewOpen(false);
    setEditingTemplate(null);
    setPreviewTemplate(null);
    onUpdated();
    showToast("Application deleted.");
  };

  const closeEditor = () => {
    setEditorOpen(false);
    setEditingTemplate(null);
  };

  if (!managerUserId || (!saveTarget && bulkPropertyIds.length === 0)) return null;

  const previewListingId = listingId?.trim() ?? "";
  const editorTitle = editorMode === "add" ? "Add application" : "Edit application";

  return (
    <>
      <PortalPropertyDetailSection contentClassName="space-y-0">
        {templates.map((template) => (
          <div key={template.id} className={PORTAL_PROPERTY_DETAIL_LIST_ROW_CLASS}>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">{template.label}</p>
              {formatApplicationLeaseTermsLabel(template.applicationLeaseTerms) ? (
                <p className="mt-0.5 text-xs text-muted">
                  Applicants: {formatApplicationLeaseTermsLabel(template.applicationLeaseTerms)}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-nowrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className={PORTAL_PROPERTY_DETAIL_ACTION_BUTTON_CLASS}
                data-attr={`application-view-${template.id}`}
                onClick={() => openApplicationPreview(template)}
              >
                View
              </Button>
              <Button
                type="button"
                variant="outline"
                className={PORTAL_PROPERTY_DETAIL_ACTION_BUTTON_CLASS}
                data-attr={`application-edit-${template.id}`}
                onClick={() => openEditApplication(template)}
              >
                Edit
              </Button>
            </div>
          </div>
        ))}
      </PortalPropertyDetailSection>

      <div className={PORTAL_LIST_ADD_ROW_WRAP_CLASS}>
        <PortalListAddRow
          label="Add"
          icon={PORTAL_LIST_ADD_ICONS.application}
          onClick={openAdd}
          dataAttr="property-application-add"
        />
      </div>

      {editorOpen ? (
        <ManagerApplicationQuestionsEditorModal
          open
          title={editorTitle}
          sub={syncedSub}
          saveTarget={saveTarget ?? undefined}
          propertyIds={bulkPropertyIds.length > 0 ? bulkPropertyIds : undefined}
          managerUserId={managerUserId}
          initialVariant={editingTemplate?.formVariant ?? "standard"}
          lockVariant={Boolean(editingTemplate)}
          templateEditorMode={editorMode}
          applicationTemplate={editingTemplate}
          templates={templates}
          onPersistSubmission={persistSubmission}
          canDelete={editorMode === "edit" && templates.length > 1}
          onDelete={
            editingTemplate
              ? () => handleDeleteTemplate(editingTemplate.id, editingTemplate.label)
              : undefined
          }
          onClose={closeEditor}
          onSaved={onUpdated}
          showToast={showToast}
        />
      ) : null}

      <Modal
        open={previewOpen}
        onClose={() => {
          setPreviewOpen(false);
          setPreviewTemplate(null);
        }}
        title={previewTemplate ? `View · ${previewTemplate.label}` : "View"}
        presentation="dialog"
        dense
        assistantStrip={false}
        panelClassName="flex max-h-[min(90vh,56rem)] w-full max-w-5xl flex-col"
        dataAttr="property-application-preview"
      >
        {previewOpen && previewTemplate ? (
          <div className="mx-auto w-full max-w-5xl">
            {previewTemplate.formVariant === "cosigner" ? (
              <CosignerApplyFlow
                key={previewTemplate.id}
                embedded
                previewMode
                showToast={showToast}
                applicationKind={previewTemplate.kind === "short-term" ? "short-term" : "long-term"}
                onBack={() => {
                  setPreviewOpen(false);
                  setPreviewTemplate(null);
                }}
                onDone={() => {
                  setPreviewOpen(false);
                  setPreviewTemplate(null);
                }}
              />
            ) : previewListingId ? (
              <RentalApplicationWizard
                key={`${previewListingId}-${previewTemplate.id}`}
                showToast={showToast}
                mode="manager"
                layout="embedded"
                linkedPropertyId={previewListingId}
                linkedRentalType={previewTemplate.kind === "short-term" ? "short_term" : "standard"}
                templatePreview
                onManagerCancel={() => {
                  setPreviewOpen(false);
                  setPreviewTemplate(null);
                }}
              />
            ) : null}
          </div>
        ) : null}
      </Modal>
    </>
  );
}
