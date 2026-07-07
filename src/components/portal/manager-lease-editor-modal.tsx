"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import type { ManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";
import {
  persistManagerListingSubmission,
  type ManagerPropertySaveTarget,
} from "@/lib/manager-property-save-target";

const LEASE_TEMPLATE_MAX_BYTES = 8 * 1024 * 1024;

type LeaseDraft = Pick<
  ManagerListingSubmissionV1,
  "leaseConfigMode" | "leaseCustomKind" | "customLeaseTerms" | "leaseTemplateDocUrl" | "leaseTemplateDocName"
>;

function draftFromSubmission(sub: ManagerListingSubmissionV1): LeaseDraft {
  return {
    leaseConfigMode: sub.leaseConfigMode ?? "standard",
    leaseCustomKind: sub.leaseCustomKind === "document" ? "document" : "terms",
    customLeaseTerms: sub.customLeaseTerms ?? "",
    leaseTemplateDocUrl: sub.leaseTemplateDocUrl ?? null,
    leaseTemplateDocName: sub.leaseTemplateDocName ?? "",
  };
}

function validateLeaseDraft(draft: LeaseDraft): string | null {
  if (draft.leaseConfigMode !== "custom") return null;
  if (draft.leaseCustomKind === "document") {
    return draft.leaseTemplateDocUrl?.trim() ? null : "Upload your lease template (PDF), or use the Axis standard lease.";
  }
  return draft.customLeaseTerms?.trim()
    ? null
    : "Enter the lease information you want included, or use the Axis standard lease.";
}

/** Edit lease configuration for a property — same options as the listing wizard Lease step. */
export function ManagerLeaseEditorModal({
  open,
  sub,
  saveTarget,
  managerUserId,
  onClose,
  onSaved,
  showToast,
}: {
  open: boolean;
  sub: ManagerListingSubmissionV1;
  saveTarget: ManagerPropertySaveTarget;
  managerUserId: string;
  onClose: () => void;
  onSaved: () => void;
  showToast: (m: string) => void;
}) {
  const [draft, setDraft] = useState<LeaseDraft>(() => draftFromSubmission(sub));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(draftFromSubmission(sub));
    setError(null);
  }, [open, sub]);

  const leaseMode = draft.leaseConfigMode ?? "standard";
  const leaseKind = draft.leaseCustomKind === "document" ? "document" : "terms";

  const onPickLeaseTemplateDoc = (file: File | null) => {
    if (!file) return;
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    if (!isPdf) {
      showToast("Upload the lease template as a PDF.");
      return;
    }
    if (file.size > LEASE_TEMPLATE_MAX_BYTES) {
      showToast("Lease template is too large — keep it under 8 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : null;
      if (!dataUrl) {
        showToast("Could not read that file. Try again.");
        return;
      }
      setError(null);
      setDraft((d) => ({ ...d, leaseTemplateDocUrl: dataUrl, leaseTemplateDocName: file.name }));
    };
    reader.onerror = () => showToast("Could not read that file. Try again.");
    reader.readAsDataURL(file);
  };

  const save = () => {
    const validationError = validateLeaseDraft(draft);
    if (validationError) {
      setError(validationError);
      showToast(validationError);
      return;
    }
    const next: ManagerListingSubmissionV1 = {
      ...sub,
      leaseConfigMode: draft.leaseConfigMode ?? "standard",
      leaseCustomKind: draft.leaseCustomKind === "document" ? "document" : "terms",
      customLeaseTerms: draft.customLeaseTerms ?? "",
      leaseTemplateDocUrl: draft.leaseTemplateDocUrl ?? null,
      leaseTemplateDocName: draft.leaseTemplateDocName ?? "",
    };
    if (!persistManagerListingSubmission(saveTarget, managerUserId, next)) {
      showToast("Could not save lease settings.");
      return;
    }
    showToast("Lease settings saved.");
    onClose();
    onSaved();
  };

  return (
    <Modal open={open} title="Lease" onClose={onClose} panelClassName="max-w-2xl">
      <p className="text-sm text-muted">
        Choose how the lease document is created when you place a resident at this property.
      </p>

      <div className="mt-4 space-y-6">
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border bg-card p-4">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-border text-primary"
            data-attr="property-lease-standard-toggle"
            checked={leaseMode === "standard"}
            onChange={(e) => {
              setError(null);
              setDraft((d) => ({ ...d, leaseConfigMode: e.target.checked ? "standard" : "custom" }));
            }}
          />
          <span>
            <span className="block text-sm font-semibold text-foreground">Use Axis standard system</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-muted">
              Axis generates a complete room-rental lease from the approved application and this listing — rent,
              deposits, house rules, and local disclosures included. Uncheck to add your own lease terms or upload a
              lease template.
            </span>
          </span>
        </label>

        {leaseMode === "custom" ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {([
                {
                  kind: "terms" as const,
                  title: "Add custom lease information",
                  detail: "Write the clauses you want. Axis adds them to the generated lease as an addendum.",
                },
                {
                  kind: "document" as const,
                  title: "Upload a lease template (PDF)",
                  detail: "Your document becomes the lease text. Axis adds a placement summary and e-signatures.",
                },
              ]).map((opt) => (
                <button
                  key={opt.kind}
                  type="button"
                  data-attr={`property-lease-kind-${opt.kind}`}
                  onClick={() => {
                    setError(null);
                    setDraft((d) => ({ ...d, leaseCustomKind: opt.kind }));
                  }}
                  className={`rounded-2xl border p-4 text-left transition ${
                    leaseKind === opt.kind
                      ? "border-primary bg-primary/10 ring-1 ring-primary/25"
                      : "border-border bg-card hover:border-primary/30"
                  }`}
                >
                  <p className="text-sm font-semibold text-foreground">{opt.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted">{opt.detail}</p>
                </button>
              ))}
            </div>

            {leaseKind === "terms" ? (
              <div>
                <p className="text-sm font-medium text-foreground">
                  Custom lease information <span className="text-rose-600">*</span>
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  One clause per paragraph. These appear in the generated lease as “Additional Provisions from Property
                  Manager”.
                </p>
                <textarea
                  rows={8}
                  value={draft.customLeaseTerms ?? ""}
                  onChange={(e) => {
                    setError(null);
                    setDraft((d) => ({ ...d, customLeaseTerms: e.target.value }));
                  }}
                  placeholder={
                    "e.g. Parking: one assigned spot in the rear lot is included.\n\nSmoking is prohibited everywhere on the property, including balconies."
                  }
                  className={`mt-2 w-full rounded-xl border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/20 ${
                    error && leaseKind === "terms" ? "border-red-400 ring-2 ring-red-100" : "border-border"
                  }`}
                />
              </div>
            ) : (
              <div>
                <p className="text-sm font-medium text-foreground">
                  Lease template <span className="text-rose-600">*</span>
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  PDF up to 8 MB. Used as the lease document for every placement at this property.
                </p>
                {draft.leaseTemplateDocUrl ? (
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-3.5 py-3">
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
                        onClick={() =>
                          setDraft((d) => ({ ...d, leaseTemplateDocUrl: null, leaseTemplateDocName: "" }))
                        }
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <label
                    className={`mt-2 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border border-dashed px-4 py-8 text-center transition hover:border-primary/40 ${
                      error && leaseKind === "document" ? "border-red-400 ring-2 ring-red-100" : "border-border bg-accent/20"
                    }`}
                  >
                    <input
                      type="file"
                      accept="application/pdf,.pdf"
                      className="hidden"
                      data-attr="property-lease-template-upload"
                      onChange={(e) => {
                        onPickLeaseTemplateDoc(e.target.files?.[0] ?? null);
                        e.target.value = "";
                      }}
                    />
                    <span className="text-sm font-semibold text-foreground">Upload lease template (PDF)</span>
                    <span className="text-xs text-muted">Click to choose a file · up to 8 MB</span>
                  </label>
                )}
              </div>
            )}

            {error ? <p className="text-sm text-red-600">{error}</p> : null}
          </div>
        ) : null}
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
