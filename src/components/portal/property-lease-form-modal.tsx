"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal, ModalFooter } from "@/components/ui/modal";
import {
  LeaseConfigForm,
  LeaseDocumentAndTypeFields,
  readLeaseTemplateFile,
  type LeaseConfigDraft,
} from "@/components/portal/lease-config-form";
import { LeaseConfigPreview } from "@/components/portal/lease-config-preview";
import type { ManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";
import { buildPropertyLeasePreview, type PropertyLeasePreviewHint } from "@/lib/property-lease-preview";
import {
  PROPERTY_LEASE_TYPE_OPTIONS,
  createPropertyLeaseTemplate,
  normalizeLeaseTemplateKind,
  updatePropertyLeaseTemplate,
  type PropertyLeaseTemplate,
  type PropertyLeaseTemplateKind,
} from "@/lib/property-lease-templates";
import {
  draftFieldsFromLeaseSource,
  leaseSourceFromDraft,
  type PropertyLeaseSource,
} from "@/lib/property-lease-source";

const fieldLabelClass = "mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-muted";

function validateLeaseDraft(draft: LeaseConfigDraft, source: PropertyLeaseSource): string | null {
  if (source === "axis_default") return null;
  if (source === "custom_format") {
    return draft.leaseTemplateDocUrl?.trim()
      ? null
      : "Upload your lease PDF, or switch to PropLane default.";
  }
  return draft.customLeaseTerms?.trim()
    ? null
    : "Enter your custom clauses, or switch to PropLane default.";
}

function draftFromTemplate(template: PropertyLeaseTemplate): LeaseConfigDraft {
  return {
    leaseConfigMode: template.leaseConfigMode,
    leaseCustomKind: template.leaseCustomKind === "document" ? "document" : "terms",
    customLeaseTerms: template.customLeaseTerms ?? "",
    leaseTemplateDocUrl: template.leaseTemplateDocUrl ?? null,
    leaseTemplateDocName: template.leaseTemplateDocName ?? "",
  };
}

/**
 * Single-screen add / edit lease — name, agreement type, document source, and inline clauses or PDF.
 */
export function PropertyLeaseFormModal({
  open,
  mode,
  sub,
  template,
  templates,
  propertyHint,
  demoMode = false,
  onClose,
  onSave,
  showToast,
}: {
  open: boolean;
  mode: "add" | "edit";
  sub: ManagerListingSubmissionV1;
  template?: PropertyLeaseTemplate | null;
  templates?: PropertyLeaseTemplate[];
  propertyHint?: PropertyLeasePreviewHint;
  demoMode?: boolean;
  onClose: () => void;
  onSave: (nextTemplates: PropertyLeaseTemplate[]) => boolean;
  showToast: (message: string) => void;
}) {
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<PropertyLeaseTemplateKind>("room-rental");
  const [draft, setDraft] = useState<LeaseConfigDraft>(() => draftFieldsFromLeaseSource("axis_default"));
  const [error, setError] = useState<string | null>(null);
  // The template picker uploads to the private bucket before it returns a URL;
  // saving mid-upload would fail validation as if no file had been chosen.
  const [templateUploading, setTemplateUploading] = useState(false);

  const source = leaseSourceFromDraft(draft);
  const typeMeta = useMemo(
    () => PROPERTY_LEASE_TYPE_OPTIONS.find((o) => o.id === kind),
    [kind],
  );

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

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (mode === "edit" && template) {
      setLabel(template.label);
      setKind(normalizeLeaseTemplateKind(template.kind));
      setDraft(draftFromTemplate(template));
      return;
    }
    setLabel(PROPERTY_LEASE_TYPE_OPTIONS[0]!.defaultLabel);
    setKind("room-rental");
    setDraft(draftFieldsFromLeaseSource("axis_default"));
  }, [open, mode, template]);

  useEffect(() => {
    if (!open || mode === "edit") return;
    const meta = PROPERTY_LEASE_TYPE_OPTIONS.find((o) => o.id === kind);
    if (meta) setLabel(meta.defaultLabel);
  }, [kind, open, mode]);

  const customTermsError = error && source === "custom_comments" ? error : null;
  const leaseTemplateError = error && source === "custom_format" ? error : null;

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

  const setSource = (next: PropertyLeaseSource) => {
    setError(null);
    setDraft((d) => ({ ...d, ...draftFieldsFromLeaseSource(next) }));
  };

  const dismiss = () => onClose();

  const save = () => {
    const validationError = validateLeaseDraft(draft, source);
    if (validationError) {
      setError(validationError);
      showToast(validationError);
      return;
    }

    const trimmedLabel = label.trim() || typeMeta?.defaultLabel || "Lease";
    const leaseFields = {
      leaseConfigMode: draft.leaseConfigMode ?? "standard",
      leaseCustomKind: draft.leaseCustomKind === "document" ? ("document" as const) : ("terms" as const),
      customLeaseTerms: draft.customLeaseTerms ?? "",
      leaseTemplateDocUrl: draft.leaseTemplateDocUrl ?? null,
      leaseTemplateDocName: draft.leaseTemplateDocName ?? "",
    };

    if (mode === "add") {
      const created = createPropertyLeaseTemplate({
        kind,
        label: trimmedLabel,
        source,
        customLeaseTerms: leaseFields.customLeaseTerms,
        leaseTemplateDocUrl: leaseFields.leaseTemplateDocUrl,
        leaseTemplateDocName: leaseFields.leaseTemplateDocName,
      });
      const next = [...(templates ?? []), created];
      if (!onSave(next)) return;
      showToast("Lease added.");
      dismiss();
      return;
    }

    if (!template || !templates) {
      showToast("Could not save lease.");
      return;
    }

    const next = updatePropertyLeaseTemplate(templates, template.id, {
      label: trimmedLabel,
      kind,
      ...leaseFields,
    });
    if (!onSave(next)) return;
    showToast("Lease saved.");
    dismiss();
  };

  return (
    <Modal
      open={open}
      title={mode === "add" ? "New lease" : "Edit lease"}
      description="Set the agreement type and how the lease document is produced for this property."
      onClose={dismiss}
      panelClassName="max-w-2xl"
      assistantContext="Lease — agreement type, PropLane default, custom clauses, or uploaded PDF"
      footer={
        <ModalFooter>
          <Button
            type="button"
            variant="primary"
            className="rounded-full"
            disabled={templateUploading}
            onClick={save}
            data-attr={mode === "add" ? "property-lease-add-save" : "property-lease-edit-save"}
          >
            {templateUploading ? "Uploading…" : "Save lease"}
          </Button>
        </ModalFooter>
      }
    >
      <div className="space-y-4">
        <div>
          <label className={fieldLabelClass} htmlFor="property-lease-name">
            Lease name
          </label>
          <Input
            id="property-lease-name"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={typeMeta?.defaultLabel ?? "e.g. Room rental lease"}
            data-attr="property-lease-name"
          />
        </div>

        <LeaseDocumentAndTypeFields
          source={source}
          onSourceChange={setSource}
          kind={kind}
          onKindChange={setKind}
          dataAttrPrefix="property"
        />

        {source !== "axis_default" ? (
          <LeaseConfigForm
            variant="modal"
            embedded
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
            hideDocumentDropdown
            forcedSource={source}
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
