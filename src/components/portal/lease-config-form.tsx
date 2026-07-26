"use client";

import { Textarea, Select } from "@/components/ui/input";
import type { ManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";
import {
  PROPERTY_LEASE_SOURCE_OPTIONS,
  draftFieldsFromLeaseSource,
  leaseSourceFromDraft,
  type PropertyLeaseSource,
} from "@/lib/property-lease-source";

export const LEASE_TEMPLATE_MAX_BYTES = 8 * 1024 * 1024;

export type LeaseConfigDraft = Pick<
  ManagerListingSubmissionV1,
  "leaseConfigMode" | "leaseCustomKind" | "customLeaseTerms" | "leaseTemplateDocUrl" | "leaseTemplateDocName"
>;

export function leaseModeFromDraft(draft: LeaseConfigDraft): "standard" | "custom" {
  return draft.leaseConfigMode === "custom" ? "custom" : "standard";
}

export function leaseKindFromDraft(draft: LeaseConfigDraft): "terms" | "document" {
  return draft.leaseCustomKind === "document" ? "document" : "terms";
}

export function readLeaseTemplateFile(
  file: File | null,
  onSuccess: (dataUrl: string, fileName: string) => void,
  showToast: (message: string) => void,
): void {
  if (!file) return;
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (!isPdf) {
    showToast("Upload the lease template as a PDF.");
    return;
  }
  if (file.size > LEASE_TEMPLATE_MAX_BYTES) {
    showToast("Lease template is too large. Keep it under 8 MB.");
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = typeof reader.result === "string" ? reader.result : null;
    if (!dataUrl) {
      showToast("Could not read that file. Try again.");
      return;
    }
    onSuccess(dataUrl, file.name);
  };
  reader.onerror = () => showToast("Could not read that file. Try again.");
  reader.readAsDataURL(file);
}

type LeaseConfigFormProps = {
  draft: LeaseConfigDraft;
  onDraftChange: (patch: Partial<LeaseConfigDraft>) => void;
  onStandardToggle?: () => void;
  onPickLeaseTemplateDoc: (file: File | null) => void;
  dataAttrPrefix?: "listing" | "property";
  customTermsError?: string | null;
  leaseTemplateError?: string | null;
  onCustomTermsChange?: () => void;
  /** Wizard step uses FieldLabel wrappers; modal uses minimal chrome. */
  variant?: "wizard" | "modal";
  /** When true, only render conditional clauses / PDF (parent owns document dropdown). */
  embedded?: boolean;
  hideDocumentDropdown?: boolean;
  forcedSource?: PropertyLeaseSource;
};

const fieldLabelClass = "mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-muted";

function customTermsTextareaClass(hasError: boolean): string {
  return `w-full rounded-xl border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/20 ${
    hasError ? "border-red-400 ring-2 ring-red-100" : "border-border"
  }`;
}

function leaseTemplateUploadClass(hasError: boolean): string {
  return `flex cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border border-dashed px-4 py-6 text-center transition hover:border-primary/40 ${
    hasError ? "border-red-400 ring-2 ring-red-100" : "border-border bg-accent/20"
  }`;
}

/** Shared lease configuration UI — format dropdown plus conditional clauses or PDF upload. */
export function LeaseConfigForm({
  draft,
  onDraftChange,
  onStandardToggle,
  onPickLeaseTemplateDoc,
  dataAttrPrefix = "listing",
  customTermsError = null,
  leaseTemplateError = null,
  onCustomTermsChange,
  variant = "wizard",
  embedded = false,
  hideDocumentDropdown = false,
  forcedSource,
}: LeaseConfigFormProps) {
  const source = forcedSource ?? leaseSourceFromDraft(draft);
  const formatMeta = PROPERTY_LEASE_SOURCE_OPTIONS.find((o) => o.id === source);
  const templateUploadAttr = `${dataAttrPrefix}-lease-template-upload`;

  const setSource = (next: PropertyLeaseSource) => {
    onStandardToggle?.();
    onDraftChange(draftFieldsFromLeaseSource(next));
  };

  if (variant === "wizard") {
    return (
      <div className="space-y-6">
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border bg-card p-4">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-border text-primary"
            data-attr={`${dataAttrPrefix}-lease-standard-toggle`}
            checked={source === "axis_default"}
            onChange={(e) => setSource(e.target.checked ? "axis_default" : "custom_comments")}
          />
          <span>
            <span className="block text-sm font-semibold text-foreground">Use PropLane standard system</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-muted">
              PropLane generates a complete room-rental lease from the approved application and this listing.
            </span>
          </span>
        </label>
        {source !== "axis_default" ? (
          <LeaseConfigCustomBody
            draft={draft}
            source={source}
            onSourceChange={setSource}
            onDraftChange={onDraftChange}
            onPickLeaseTemplateDoc={onPickLeaseTemplateDoc}
            templateUploadAttr={templateUploadAttr}
            customTermsError={customTermsError}
            leaseTemplateError={leaseTemplateError}
            onCustomTermsChange={onCustomTermsChange}
            wizard
          />
        ) : null}
      </div>
    );
  }

  if (variant === "modal" && embedded) {
    if (source === "custom_comments") {
      return (
        <CustomTermsField
          draft={draft}
          onDraftChange={onDraftChange}
          onCustomTermsChange={onCustomTermsChange}
          customTermsError={customTermsError}
        />
      );
    }
    if (source === "custom_format") {
      return (
        <PdfUploadField
          draft={draft}
          onDraftChange={onDraftChange}
          onPickLeaseTemplateDoc={onPickLeaseTemplateDoc}
          templateUploadAttr={templateUploadAttr}
          leaseTemplateError={leaseTemplateError}
        />
      );
    }
    return null;
  }

  if (variant === "modal") {
    return (
      <div className="space-y-4">
        {hideDocumentDropdown ? null : (
          <div>
            <label className={fieldLabelClass} htmlFor={`${dataAttrPrefix}-lease-document`}>
              Lease document
            </label>
            <Select
              id={`${dataAttrPrefix}-lease-document`}
              value={source}
              onChange={(e) => setSource(e.target.value as PropertyLeaseSource)}
              data-attr={`${dataAttrPrefix}-lease-document`}
            >
              {PROPERTY_LEASE_SOURCE_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </Select>
            {formatMeta ? <p className="mt-1.5 text-xs leading-relaxed text-muted">{formatMeta.detail}</p> : null}
          </div>
        )}

        {source !== "axis_default" ? (
          <LeaseConfigCustomBody
            draft={draft}
            source={source}
            onSourceChange={setSource}
            onDraftChange={onDraftChange}
            onPickLeaseTemplateDoc={onPickLeaseTemplateDoc}
            templateUploadAttr={templateUploadAttr}
            customTermsError={customTermsError}
            leaseTemplateError={leaseTemplateError}
            onCustomTermsChange={onCustomTermsChange}
          />
        ) : null}
      </div>
    );
  }

  return null;
}

function LeaseConfigCustomBody({
  draft,
  source,
  onSourceChange,
  onDraftChange,
  onPickLeaseTemplateDoc,
  templateUploadAttr,
  customTermsError,
  leaseTemplateError,
  onCustomTermsChange,
  wizard = false,
}: {
  draft: LeaseConfigDraft;
  source: PropertyLeaseSource;
  onSourceChange: (source: PropertyLeaseSource) => void;
  onDraftChange: (patch: Partial<LeaseConfigDraft>) => void;
  onPickLeaseTemplateDoc: (file: File | null) => void;
  templateUploadAttr: string;
  customTermsError: string | null;
  leaseTemplateError: string | null;
  onCustomTermsChange?: () => void;
  wizard?: boolean;
}) {
  if (wizard) {
    return (
      <div className="space-y-4">
        <div>
          <label className={fieldLabelClass}>Customization type</label>
          <Select
            value={source === "custom_format" ? "custom_format" : "custom_comments"}
            onChange={(e) => onSourceChange(e.target.value as PropertyLeaseSource)}
          >
            <option value="custom_comments">Custom clauses</option>
            <option value="custom_format">Upload your lease</option>
          </Select>
        </div>
        {source === "custom_comments" ? (
          <CustomTermsField
            draft={draft}
            onDraftChange={onDraftChange}
            onCustomTermsChange={onCustomTermsChange}
            customTermsError={customTermsError}
            wizard
          />
        ) : (
          <PdfUploadField
            draft={draft}
            onDraftChange={onDraftChange}
            onPickLeaseTemplateDoc={onPickLeaseTemplateDoc}
            templateUploadAttr={templateUploadAttr}
            leaseTemplateError={leaseTemplateError}
            wizard
          />
        )}
      </div>
    );
  }

  if (source === "custom_comments") {
    return (
      <CustomTermsField
        draft={draft}
        onDraftChange={onDraftChange}
        onCustomTermsChange={onCustomTermsChange}
        customTermsError={customTermsError}
      />
    );
  }

  return (
    <PdfUploadField
      draft={draft}
      onDraftChange={onDraftChange}
      onPickLeaseTemplateDoc={onPickLeaseTemplateDoc}
      templateUploadAttr={templateUploadAttr}
      leaseTemplateError={leaseTemplateError}
    />
  );
}

function CustomTermsField({
  draft,
  onDraftChange,
  onCustomTermsChange,
  customTermsError,
  wizard = false,
}: {
  draft: LeaseConfigDraft;
  onDraftChange: (patch: Partial<LeaseConfigDraft>) => void;
  onCustomTermsChange?: () => void;
  customTermsError: string | null;
  wizard?: boolean;
}) {
  const field = (
    <>
      {wizard ? (
        <p className="text-xs font-semibold text-muted">
          Custom clauses <span className="text-rose-600">*</span>
        </p>
      ) : (
        <label className={fieldLabelClass} htmlFor="property-lease-custom-clauses">
          Custom clauses
        </label>
      )}
      <Textarea
        id={wizard ? undefined : "property-lease-custom-clauses"}
        rows={6}
        value={draft.customLeaseTerms ?? ""}
        onChange={(e) => {
          onCustomTermsChange?.();
          onDraftChange({ customLeaseTerms: e.target.value });
        }}
        placeholder={
          "e.g. Parking: one assigned spot in the rear lot is included.\n\nSmoking is prohibited everywhere on the property."
        }
        className={`${wizard ? "mt-2 " : ""}${customTermsTextareaClass(Boolean(customTermsError))}`}
      />
      {customTermsError ? <p className="mt-1.5 text-sm text-red-600">{customTermsError}</p> : null}
    </>
  );

  if (wizard) {
    return <div className="rounded-xl border border-border bg-card p-3 sm:p-4">{field}</div>;
  }

  return <div>{field}</div>;
}

function PdfUploadField({
  draft,
  onDraftChange,
  onPickLeaseTemplateDoc,
  templateUploadAttr,
  leaseTemplateError,
  wizard = false,
}: {
  draft: LeaseConfigDraft;
  onDraftChange: (patch: Partial<LeaseConfigDraft>) => void;
  onPickLeaseTemplateDoc: (file: File | null) => void;
  templateUploadAttr: string;
  leaseTemplateError: string | null;
  wizard?: boolean;
}) {
  return (
    <div>
      {wizard ? (
        <p className="text-xs font-semibold text-muted">
          Lease template <span className="text-rose-600">*</span>
        </p>
      ) : (
        <label className={fieldLabelClass}>Lease template (PDF)</label>
      )}
      {draft.leaseTemplateDocUrl ? (
        <div className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-3.5 py-3 ${wizard ? "mt-2" : ""}`}>
          <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
            {draft.leaseTemplateDocName?.trim() || "Lease template.pdf"}
          </p>
          <div className="flex items-center gap-2">
            {!draft.leaseTemplateDocUrl.startsWith("data:") ? (
              <a
                href={draft.leaseTemplateDocUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-semibold text-primary hover:underline"
              >
                View
              </a>
            ) : null}
            <button
              type="button"
              className="text-xs font-semibold text-rose-600 hover:underline"
              onClick={() => onDraftChange({ leaseTemplateDocUrl: null, leaseTemplateDocName: "" })}
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <label className={leaseTemplateUploadClass(Boolean(leaseTemplateError))}>
          <input
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            data-attr={templateUploadAttr}
            onChange={(e) => {
              onPickLeaseTemplateDoc(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
          <span className="text-sm font-semibold text-foreground">Upload lease template (PDF)</span>
          <span className="text-xs text-muted">Click to choose a file · up to 8 MB</span>
        </label>
      )}
      {leaseTemplateError ? <p className="mt-1.5 text-sm text-red-600">{leaseTemplateError}</p> : null}
    </div>
  );
}
