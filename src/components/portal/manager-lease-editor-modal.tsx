"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal, ModalFooter } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import {
  LeaseConfigForm,
  LeaseDocumentAndTypeFields,
  readLeaseTemplateFile,
  type LeaseConfigDraft,
} from "@/components/portal/lease-config-form";
import { LeaseConfigPreview } from "@/components/portal/lease-config-preview";
import type { ManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";
import {
  persistLeaseConfigToPropertyIds,
  persistManagerListingSubmission,
  type LeaseConfigFields,
  type ManagerPropertySaveTarget,
} from "@/lib/manager-property-save-target";
import { buildLeaseModalAssistantContext } from "@/lib/lease-assistant-context";
import { buildPropertyLeasePreview, type PropertyLeasePreviewHint } from "@/lib/property-lease-preview";
import { leaseSourceFromDraft, draftFieldsFromLeaseSource, type PropertyLeaseSource } from "@/lib/property-lease-source";
import {
  normalizeLeaseTemplateKind,
  readPropertyLeaseTemplates,
  syncLegacyLeaseFieldsFromTemplates,
  updatePropertyLeaseTemplate,
  type PropertyLeaseTemplate,
  type PropertyLeaseTemplateKind,
} from "@/lib/property-lease-templates";

function draftFromSubmission(sub: ManagerListingSubmissionV1): LeaseConfigDraft {
  return {
    leaseConfigMode: sub.leaseConfigMode ?? "standard",
    leaseCustomKind: sub.leaseCustomKind === "document" ? "document" : "terms",
    customLeaseTerms: sub.customLeaseTerms ?? "",
    leaseTemplateDocUrl: sub.leaseTemplateDocUrl ?? null,
    leaseTemplateDocName: sub.leaseTemplateDocName ?? "",
  };
}

function validateLeaseDraft(draft: LeaseConfigDraft, source: PropertyLeaseSource): string | null {
  if (source === "axis_default") return null;
  if (source === "custom_format") {
    return draft.leaseTemplateDocUrl?.trim() ? null : "Upload your lease template (PDF), or use the PropLane default lease.";
  }
  return draft.customLeaseTerms?.trim()
    ? null
    : "Enter the lease information you want included, or use the PropLane default lease.";
}

function leaseFieldsFromDraft(draft: LeaseConfigDraft): LeaseConfigFields {
  return {
    leaseConfigMode: draft.leaseConfigMode ?? "standard",
    leaseCustomKind: draft.leaseCustomKind === "document" ? "document" : "terms",
    customLeaseTerms: draft.customLeaseTerms ?? "",
    leaseTemplateDocUrl: draft.leaseTemplateDocUrl ?? null,
    leaseTemplateDocName: draft.leaseTemplateDocName ?? "",
  };
}

const fieldLabelClass = "mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-muted";

/** Edit lease configuration for a property — same options as the listing wizard Lease step. */
export function ManagerLeaseEditorModal({
  open,
  title = "Lease",
  sub,
  saveTarget,
  propertyIds,
  managerUserId,
  propertyHint,
  propertyId,
  propertyLabel,
  demoMode = false,
  templateId,
  templates,
  onTemplatesSaved,
  onClose,
  onSaved,
  showToast,
}: {
  open: boolean;
  title?: string;
  sub: ManagerListingSubmissionV1;
  saveTarget?: ManagerPropertySaveTarget;
  /** When set, Save applies the same lease fields to every id (bulk edit). */
  propertyIds?: string[];
  managerUserId: string;
  propertyHint?: PropertyLeasePreviewHint;
  /** Listing / pending property id for the assistant (from Properties). */
  propertyId?: string | null;
  propertyLabel?: string | null;
  demoMode?: boolean;
  /** When editing one template in a multi-lease property panel. */
  templateId?: string;
  templates?: PropertyLeaseTemplate[];
  onTemplatesSaved?: (templates: PropertyLeaseTemplate[]) => boolean;
  onClose: () => void;
  onSaved: () => void;
  showToast: (m: string) => void;
}) {
  const [draft, setDraft] = useState<LeaseConfigDraft>(() => draftFromSubmission(sub));
  const [leaseKind, setLeaseKind] = useState<PropertyLeaseTemplateKind>("room-rental");
  const [templateLabel, setTemplateLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  // The template picker uploads to the private bucket before it returns a URL;
  // saving mid-upload would fail validation as if no file had been chosen.
  const [templateUploading, setTemplateUploading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(draftFromSubmission(sub));
    setError(null);
    const primary = templateId && templates
      ? templates.find((t) => t.id === templateId)
      : readPropertyLeaseTemplates(sub)[0];
    setLeaseKind(normalizeLeaseTemplateKind(primary?.kind));
    if (templateId && templates) {
      setTemplateLabel(templates.find((t) => t.id === templateId)?.label ?? "");
    } else {
      setTemplateLabel("");
    }
  }, [open, sub, templateId, templates]);

  const source = leaseSourceFromDraft(draft);

  const setSource = (next: PropertyLeaseSource) => {
    setError(null);
    setDraft((d) => ({ ...d, ...draftFieldsFromLeaseSource(next) }));
  };

  function applyLeaseConfigAndKind(
    base: ManagerListingSubmissionV1,
    leaseFields: LeaseConfigFields,
  ): ManagerListingSubmissionV1 {
    const withFields: ManagerListingSubmissionV1 = { ...base, ...leaseFields };
    const templates = readPropertyLeaseTemplates(withFields);
    if (templates.length === 0) return withFields;
    const [primary, ...rest] = templates;
    return syncLegacyLeaseFieldsFromTemplates(withFields, [
      { ...primary!, kind: leaseKind, updatedAt: new Date().toISOString() },
      ...rest,
    ]);
  }

  const previewSub = useMemo(
    (): ManagerListingSubmissionV1 => ({
      ...sub,
      ...draft,
    }),
    [sub, draft],
  );

  const preview = useMemo(
    () => buildPropertyLeasePreview(previewSub, { hint: propertyHint, demo: demoMode }),
    [previewSub, propertyHint, demoMode],
  );

  const showGeneratedPreview = source === "axis_default" || source === "custom_comments";

  const customTermsError =
    error && source === "custom_comments" ? error : null;
  const leaseTemplateError =
    error && source === "custom_format" ? error : null;

  const onPickLeaseTemplateDoc = (file: File | null) => {
    readLeaseTemplateFile(
      file,
      (dataUrl, fileName) => {
        setError(null);
        setDraft((d) => ({ ...d, leaseTemplateDocUrl: dataUrl, leaseTemplateDocName: fileName }));
      },
      showToast,
      setTemplateUploading,
    );
  };

  const bulkIds = propertyIds?.filter((id) => id.trim()) ?? [];
  const isBulkSave = bulkIds.length > 0;

  const save = (): boolean => {
    const validationError = validateLeaseDraft(draft, source);
    if (validationError) {
      setError(validationError);
      showToast(validationError);
      return false;
    }
    const leaseFields = leaseFieldsFromDraft(draft);

    if (isBulkSave) {
      const { saved, failed } = persistLeaseConfigToPropertyIds(managerUserId, bulkIds, leaseFields, leaseKind);
      if (saved === 0) {
        showToast("Could not save lease settings.");
        return false;
      }
      if (failed > 0) {
        showToast(`Updated lease settings for ${saved} properties (${failed} could not be saved).`);
      } else if (saved === 1) {
        showToast("Lease settings saved.");
      } else {
        showToast(`Updated lease settings for ${saved} properties`);
      }
      onClose();
      onSaved();
      return true;
    }

    if (!saveTarget) {
      showToast("Could not save lease settings.");
      return false;
    }

    if (templateId && templates && onTemplatesSaved) {
      const nextTemplates = updatePropertyLeaseTemplate(templates, templateId, {
        label: templateLabel.trim() || templates.find((t) => t.id === templateId)?.label || "Lease",
        kind: leaseKind,
        leaseConfigMode: leaseFields.leaseConfigMode,
        leaseCustomKind: leaseFields.leaseCustomKind,
        customLeaseTerms: leaseFields.customLeaseTerms,
        leaseTemplateDocUrl: leaseFields.leaseTemplateDocUrl,
        leaseTemplateDocName: leaseFields.leaseTemplateDocName,
      });
      if (!onTemplatesSaved(nextTemplates)) return false;
      showToast("Lease template saved.");
      onClose();
      onSaved();
      return true;
    }

    const next = applyLeaseConfigAndKind(sub, leaseFields);
    if (!persistManagerListingSubmission(saveTarget, managerUserId, next)) {
      showToast("Could not save lease settings.");
      return false;
    }
    showToast("Lease settings saved.");
    onClose();
    onSaved();
    return true;
  };

  const dismiss = () => onClose();

  const assistantContext = buildLeaseModalAssistantContext({
    propertyId,
    propertyIds: bulkIds.length ? bulkIds : undefined,
    propertyLabel: propertyLabel ?? propertyHint?.buildingName ?? title,
    currentSource: source,
  });

  return (
    <Modal
      open={open}
      title={title}
      onClose={dismiss}
      panelClassName="max-w-2xl"
      assistantContext={assistantContext}
      assistantStorageScopeKey="Lease modal"
      footer={
        <ModalFooter>
          <Button type="button" variant="outline" className="rounded-full" onClick={dismiss}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            className="rounded-full"
            disabled={templateUploading}
            onClick={() => save()}
            data-attr="property-lease-edit-save"
          >
            {templateUploading ? "Uploading…" : "Save lease"}
          </Button>
        </ModalFooter>
      }
    >
      <div className="space-y-4">
        {bulkIds.length > 1 ? (
          <p className="text-sm text-muted">
            These settings apply to all {bulkIds.length} selected properties. Existing per-property differences are
            replaced when you save.
          </p>
        ) : null}
        {templateId ? (
          <div>
            <label
              className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-muted"
              htmlFor="property-lease-edit-name"
            >
              Lease name
            </label>
            <Input
              id="property-lease-edit-name"
              value={templateLabel}
              onChange={(e) => setTemplateLabel(e.target.value)}
              data-attr="property-lease-edit-name"
            />
          </div>
        ) : null}
        <LeaseDocumentAndTypeFields
          source={source}
          onSourceChange={setSource}
          kind={leaseKind}
          onKindChange={(next) => {
            setError(null);
            setLeaseKind(next);
          }}
          dataAttrPrefix="property"
        />
        {source !== "axis_default" ? (
          <LeaseConfigForm
            variant="modal"
            embedded
            hideDocumentDropdown
            forcedSource={source}
            dataAttrPrefix="property"
            draft={draft}
            onDraftChange={(patch) => {
              setError(null);
              setDraft((d) => ({ ...d, ...patch }));
            }}
            onStandardToggle={() => setError(null)}
            onCustomTermsChange={() => setError(null)}
            onPickLeaseTemplateDoc={onPickLeaseTemplateDoc}
            customTermsError={customTermsError}
            leaseTemplateError={leaseTemplateError}
          />
        ) : null}

        {showGeneratedPreview ? (
          <div>
            <p className={fieldLabelClass}>Lease preview</p>
            <LeaseConfigPreview preview={preview} />
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
