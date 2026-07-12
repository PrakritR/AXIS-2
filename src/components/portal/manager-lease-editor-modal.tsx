"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import {
  LeaseConfigForm,
  readLeaseTemplateFile,
  type LeaseConfigDraft,
} from "@/components/portal/lease-config-form";
import type { ManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";
import {
  persistLeaseConfigToPropertyIds,
  persistManagerListingSubmission,
  type LeaseConfigFields,
  type ManagerPropertySaveTarget,
} from "@/lib/manager-property-save-target";
import { buildPropertyLeasePreview, type PropertyLeasePreviewHint } from "@/lib/property-lease-preview";
import { leaseSourceFromDraft, type PropertyLeaseSource } from "@/lib/property-lease-source";

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

function LeaseConfigPreview({
  preview,
}: {
  preview: ReturnType<typeof buildPropertyLeasePreview>;
}) {
  if (preview.unsupportedJurisdiction) {
    return (
      <p className="rounded-xl border border-border bg-accent/20 px-3 py-2.5 text-sm text-muted">
        {preview.plainText}
      </p>
    );
  }
  if (preview.html) {
    return (
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <iframe
          title="Lease preview"
          srcDoc={preview.html}
          sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          className="h-[min(48vh,400px)] w-full"
        />
      </div>
    );
  }
  if (preview.plainText) {
    return (
      <p className="rounded-xl border border-border bg-accent/20 px-3 py-2.5 text-sm text-muted">
        {preview.plainText}
      </p>
    );
  }
  return null;
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

/** Edit lease configuration for a property — same options as the listing wizard Lease step. */
export function ManagerLeaseEditorModal({
  open,
  title = "Lease",
  sub,
  saveTarget,
  propertyIds,
  managerUserId,
  propertyHint,
  demoMode = false,
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
  demoMode?: boolean;
  onClose: () => void;
  onSaved: () => void;
  showToast: (m: string) => void;
}) {
  const [draft, setDraft] = useState<LeaseConfigDraft>(() => draftFromSubmission(sub));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(draftFromSubmission(sub));
    setError(null);
  }, [open, sub]);

  const source = leaseSourceFromDraft(draft);

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
    );
  };

  const bulkIds = propertyIds?.filter((id) => id.trim()) ?? [];
  const isBulkSave = bulkIds.length > 0;

  const save = () => {
    const validationError = validateLeaseDraft(draft, source);
    if (validationError) {
      setError(validationError);
      showToast(validationError);
      return;
    }
    const leaseFields = leaseFieldsFromDraft(draft);

    if (isBulkSave) {
      const { saved, failed } = persistLeaseConfigToPropertyIds(managerUserId, bulkIds, leaseFields);
      if (saved === 0) {
        showToast("Could not save lease settings.");
        return;
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
      return;
    }

    if (!saveTarget) {
      showToast("Could not save lease settings.");
      return;
    }
    const next: ManagerListingSubmissionV1 = { ...sub, ...leaseFields };
    if (!persistManagerListingSubmission(saveTarget, managerUserId, next)) {
      showToast("Could not save lease settings.");
      return;
    }
    showToast("Lease settings saved.");
    onClose();
    onSaved();
  };

  return (
    <Modal open={open} title={title} onClose={onClose} panelClassName="max-w-2xl">
      {bulkIds.length > 1 ? (
        <p className="mb-4 text-sm text-muted">
          These settings apply to all {bulkIds.length} selected properties. Existing per-property differences are
          replaced when you save.
        </p>
      ) : null}
      <LeaseConfigForm
        variant="modal"
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

      <div className="mt-6">
        <LeaseConfigPreview preview={preview} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" variant="primary" className="rounded-full" data-attr="property-lease-save" onClick={save}>
          Save
        </Button>
        <Button type="button" variant="outline" className="rounded-full" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Modal>
  );
}
