"use client";

import { PromotionAiBetaBadge } from "@/components/portal/promotion-ai-draft-card";
import { Textarea } from "@/components/ui/input";
import type { ManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";

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
};

function customTermsTextareaClass(hasError: boolean): string {
  return `w-full rounded-xl border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/20 ${
    hasError ? "border-red-400 ring-2 ring-red-100" : "border-border"
  }`;
}

function leaseTemplateUploadClass(hasError: boolean): string {
  return `flex cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border border-dashed px-4 py-8 text-center transition hover:border-primary/40 ${
    hasError ? "border-red-400 ring-2 ring-red-100" : "border-border bg-accent/20"
  }`;
}

/** Shared lease configuration UI — Axis standard checkbox, AI BETA / PDF custom options. */
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
}: LeaseConfigFormProps) {
  const leaseMode = leaseModeFromDraft(draft);
  const leaseKind = leaseKindFromDraft(draft);
  const standardToggleAttr = `${dataAttrPrefix}-lease-standard-toggle`;
  const templateUploadAttr = `${dataAttrPrefix}-lease-template-upload`;

  return (
    <div className="space-y-6">
      <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border bg-card p-4">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 rounded border-border text-primary"
          data-attr={standardToggleAttr}
          checked={leaseMode === "standard"}
          onChange={(e) => {
            onStandardToggle?.();
            onDraftChange({ leaseConfigMode: e.target.checked ? "standard" : "custom" });
          }}
        />
        <span>
          <span className="block text-sm font-semibold text-foreground">Use PropLane standard system</span>
          <span className="mt-0.5 block text-xs leading-relaxed text-muted">
            PropLane generates a complete room-rental lease from the approved application and this listing: rent,
            deposits, house rules, and local disclosures included. Uncheck to add your own lease terms or upload a
            lease template.
          </span>
        </span>
      </label>

      {leaseMode === "custom" ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              data-attr={`${dataAttrPrefix}-lease-kind-terms`}
              onClick={() => onDraftChange({ leaseCustomKind: "terms" })}
              className={`rounded-2xl border p-4 text-left transition ${
                leaseKind === "terms"
                  ? "border-primary/40 bg-primary/10 ring-1 ring-primary/25"
                  : "border-primary/30 bg-primary/5 hover:border-primary/40"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-foreground">AI BETA generation</p>
                <PromotionAiBetaBadge />
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                Describe custom clauses or addendum terms. PropLane merges them into the generated lease.
              </p>
            </button>

            <button
              type="button"
              data-attr={`${dataAttrPrefix}-lease-kind-document`}
              onClick={() => onDraftChange({ leaseCustomKind: "document" })}
              className={`rounded-2xl border p-4 text-left transition ${
                leaseKind === "document"
                  ? "border-primary bg-primary/10 ring-1 ring-primary/25"
                  : "border-border bg-card hover:border-primary/30"
              }`}
            >
              <p className="text-sm font-semibold text-foreground">Upload a lease template (PDF)</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                Your document becomes the lease text. PropLane adds a placement summary and e-signatures.
              </p>
            </button>
          </div>

          {leaseKind === "terms" ? (
            <div
              className="rounded-xl border border-primary/30 bg-primary/5 p-3 sm:p-4"
              data-wizard-field={variant === "wizard" ? "customLeaseTerms" : undefined}
            >
              {variant === "wizard" ? (
                <p className="text-xs font-semibold text-muted">
                  Custom clauses <span className="text-rose-600">*</span>
                </p>
              ) : (
                <p className="text-xs leading-relaxed text-muted">
                  One clause per paragraph. These appear in the generated lease as “Additional Provisions from Property
                  Manager”.
                </p>
              )}
              <Textarea
                rows={8}
                value={draft.customLeaseTerms ?? ""}
                onChange={(e) => {
                  onCustomTermsChange?.();
                  onDraftChange({ customLeaseTerms: e.target.value });
                }}
                placeholder={
                  "e.g. Parking: one assigned spot in the rear lot is included.\n\nSmoking is prohibited everywhere on the property, including balconies."
                }
                className={`mt-2 ${customTermsTextareaClass(Boolean(customTermsError))}`}
              />
              {customTermsError ? <p className="mt-1.5 text-sm text-red-600">{customTermsError}</p> : null}
            </div>
          ) : (
            <div data-wizard-field={variant === "wizard" ? "leaseTemplateDoc" : undefined}>
              {variant === "wizard" ? (
                <p className="text-xs font-semibold text-muted">
                  Lease template <span className="text-rose-600">*</span>
                  <span className="mt-0.5 block font-normal">PDF up to 8 MB. Used as the lease document for every placement at this property.</span>
                </p>
              ) : null}
              {draft.leaseTemplateDocUrl ? (
                <div
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-3.5 py-3 ${
                    variant === "wizard" ? "mt-2" : ""
                  }`}
                >
                  <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                    📄 {draft.leaseTemplateDocName?.trim() || "Lease template.pdf"}
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
          )}
        </div>
      ) : null}
    </div>
  );
}
