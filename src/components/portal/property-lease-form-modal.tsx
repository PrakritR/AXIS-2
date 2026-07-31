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
import { LeaseHtmlDirectEditor } from "@/components/portal/lease-html-direct-editor";
import type { ManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";
import type { PropertyLeasePreviewHint } from "@/lib/property-lease-preview";
import { resolvePropertyLeaseEditHtml } from "@/lib/property-lease-edit";
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
import { parseUploadedLeasePdf } from "@/lib/lease-template-parse.client";

const fieldLabelClass = "mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-muted";

function validateLeaseDraft(draft: LeaseConfigDraft, source: PropertyLeaseSource): string | null {
  if (source === "axis_default" || source === "custom_builder") return null;
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
  const leaseCustomKind =
    template.leaseCustomKind === "document"
      ? "document"
      : template.leaseCustomKind === "builder"
        ? "builder"
        : "terms";
  return {
    leaseConfigMode: template.leaseConfigMode,
    leaseCustomKind,
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
  const [kind, setKind] = useState<PropertyLeaseTemplateKind>("long-term");
  const [draft, setDraft] = useState<LeaseConfigDraft>(() => draftFieldsFromLeaseSource("axis_default"));
  const [error, setError] = useState<string | null>(null);
  const [htmlOverride, setHtmlOverride] = useState("");
  const [templateUploading, setTemplateUploading] = useState(false);
  const [parsingLease, setParsingLease] = useState(false);

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

  const templateDraft = useMemo(
    () => ({
      leaseConfigMode: draft.leaseConfigMode ?? "standard",
      leaseCustomKind:
        draft.leaseCustomKind === "document"
          ? ("document" as const)
          : draft.leaseCustomKind === "builder"
            ? ("builder" as const)
            : ("terms" as const),
      customLeaseTerms: draft.customLeaseTerms ?? "",
      leaseTemplateDocUrl: draft.leaseTemplateDocUrl ?? null,
      leaseTemplateDocName: draft.leaseTemplateDocName ?? "",
      leaseTemplateHtmlOverride: "",
    }),
    [draft],
  );

  const baselineHtml = useMemo(
    () =>
      resolvePropertyLeaseEditHtml({
        sub: previewSub,
        draft: templateDraft,
        source,
        hint: propertyHint,
        demo: demoMode,
      }),
    [previewSub, templateDraft, source, propertyHint, demoMode],
  );

  const editorHtml = htmlOverride.trim() || baselineHtml;
  const showLeaseEditor = Boolean(editorHtml.trim());

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (mode === "edit" && template) {
      setLabel(template.label);
      setKind(normalizeLeaseTemplateKind(template.kind));
      setDraft(draftFromTemplate(template));
      setHtmlOverride(template.leaseTemplateHtmlOverride?.trim() ?? "");
      return;
    }
    setLabel(PROPERTY_LEASE_TYPE_OPTIONS[0]!.defaultLabel);
    setKind("long-term");
    setDraft(draftFieldsFromLeaseSource("axis_default"));
    setHtmlOverride("");
  }, [open, mode, template]);

  const handleKindChange = (next: PropertyLeaseTemplateKind) => {
    setKind(next);
    if (next === "custom" && leaseSourceFromDraft(draft) === "axis_default") {
      setDraft((d) => ({ ...d, ...draftFieldsFromLeaseSource("custom_builder") }));
      setHtmlOverride("");
    }
  };

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
        setHtmlOverride("");
        setDraft((d) => ({ ...d, leaseTemplateDocUrl: dataUrl, leaseTemplateDocName: fileName }));
        if (dataUrl.startsWith("data:")) {
          showToast("Lease uploaded. Parsing runs after save in demo mode.");
          return;
        }
        setParsingLease(true);
        void parseUploadedLeasePdf({ url: dataUrl, fileName, kind })
          .then((result) => {
            setHtmlOverride(result.html);
            if (!mode || mode === "add") {
              setKind(result.inferredKind);
            }
            showToast(
              `Lease parsed into PropPlane format (${result.sectionCount} section${result.sectionCount === 1 ? "" : "s"}).`,
            );
          })
          .catch((err) => {
            console.error("property-lease-form-modal: parse failed", err);
            showToast(err instanceof Error ? err.message : "Could not parse that lease PDF.");
          })
          .finally(() => setParsingLease(false));
      },
      showToast,
      setTemplateUploading,
    );
  };

  const setSource = (next: PropertyLeaseSource) => {
    setError(null);
    setHtmlOverride("");
    setDraft((d) => ({ ...d, ...draftFieldsFromLeaseSource(next) }));
  };

  const resolveHtmlOverrideToSave = (): string => {
    const trimmed = editorHtml.trim();
    if (!trimmed) return "";
    if (trimmed === baselineHtml.trim()) return "";
    return trimmed;
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
      leaseCustomKind:
        draft.leaseCustomKind === "document"
          ? ("document" as const)
          : draft.leaseCustomKind === "builder"
            ? ("builder" as const)
            : ("terms" as const),
      customLeaseTerms: draft.customLeaseTerms ?? "",
      leaseTemplateDocUrl: draft.leaseTemplateDocUrl ?? null,
      leaseTemplateDocName: draft.leaseTemplateDocName ?? "",
      leaseTemplateHtmlOverride: resolveHtmlOverrideToSave(),
    };

    if (mode === "add") {
      const created = {
        ...createPropertyLeaseTemplate({
          kind,
          label: trimmedLabel,
          source,
          customLeaseTerms: leaseFields.customLeaseTerms,
          leaseTemplateDocUrl: leaseFields.leaseTemplateDocUrl,
          leaseTemplateDocName: leaseFields.leaseTemplateDocName,
        }),
        leaseTemplateHtmlOverride: leaseFields.leaseTemplateHtmlOverride,
      };
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
      panelClassName="max-w-4xl"
      assistantContext="Lease — agreement type, PropLane default, custom clauses, or uploaded PDF"
      footer={
        <ModalFooter>
          <Button
            type="button"
            variant="primary"
            className="rounded-full"
            disabled={templateUploading || parsingLease}
            onClick={save}
            data-attr={mode === "add" ? "property-lease-add-save" : "property-lease-edit-save"}
          >
            {templateUploading ? "Uploading…" : parsingLease ? "Parsing lease…" : "Save lease"}
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
          onKindChange={handleKindChange}
          dataAttrPrefix="property"
        />

        {source !== "axis_default" && source !== "custom_builder" ? (
          <LeaseConfigForm
            variant="modal"
            embedded
            dataAttrPrefix="property"
            draft={draft}
            onDraftChange={(patch) => {
              setError(null);
              if ("customLeaseTerms" in patch || "leaseTemplateDocUrl" in patch) {
                setHtmlOverride("");
              }
              setDraft((d) => ({ ...d, ...patch }));
            }}
            onStandardToggle={() => setError(null)}
            onCustomTermsChange={() => {
              setError(null);
              setHtmlOverride("");
            }}
            onPickLeaseTemplateDoc={onPickLeaseTemplateDoc}
            customTermsError={customTermsError}
            leaseTemplateError={leaseTemplateError}
            hideDocumentDropdown
            forcedSource={source}
          />
        ) : null}

        {showLeaseEditor ? (
          <div className="flex min-h-[min(420px,55vh)] flex-col">
            <p className={fieldLabelClass}>Lease editor</p>
            <LeaseHtmlDirectEditor
              className="min-h-[min(380px,50vh)] flex-1"
              html={editorHtml}
              baselineHtml={baselineHtml}
              onChange={setHtmlOverride}
              showPersistBar={false}
            />
          </div>
        ) : source === "custom_format" && !draft.leaseTemplateDocUrl ? (
          <p className="text-sm text-muted">Upload a PDF above to preview and edit the lease shell.</p>
        ) : null}
      </div>
    </Modal>
  );
}
