"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ManagerPortalPageShell } from "@/components/portal/portal-metrics";
import { triggerDocumentDownload } from "@/components/portal/resident-other-documents";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { isoDateOnly } from "@/lib/demo/demo-data";
import { isDemoModeActive } from "@/lib/demo/demo-session";
import { safeFormatDateTime } from "@/lib/pacific-time";
import {
  findVendorDocument,
  VENDOR_DOCUMENT_HINTS,
  VENDOR_DOCUMENT_LABELS,
  VENDOR_DOCUMENT_SECTIONS,
  type VendorDocumentKind,
  type VendorDocumentRecord,
} from "@/lib/vendor-documents";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

type InsuranceDraft = {
  insuranceProvider: string;
  insurancePolicyNumber: string;
  insuranceExpiresAt: string;
};

const EMPTY_INSURANCE: InsuranceDraft = {
  insuranceProvider: "",
  insurancePolicyNumber: "",
  insuranceExpiresAt: "",
};

const DEMO_DOCUMENTS: VendorDocumentRecord[] = [
  {
    kind: "insurance",
    fileName: "pemco-certificate.pdf",
    url: "",
    uploadedAt: new Date(Date.now() - 86400000 * 30).toISOString(),
  },
];

const DEMO_INSURANCE: InsuranceDraft = {
  insuranceProvider: "Pemco Commercial",
  insurancePolicyNumber: "PC-482913",
  insuranceExpiresAt: isoDateOnly(150),
};

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}

function DocumentRow({
  kind,
  doc,
  uploading,
  disabled,
  onUpload,
  onRemove,
}: {
  kind: VendorDocumentKind;
  doc: VendorDocumentRecord | undefined;
  uploading: boolean;
  disabled: boolean;
  onUpload: (file: File) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="border-b border-border py-4 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{VENDOR_DOCUMENT_LABELS[kind]}</p>
          <p className="mt-1 text-xs text-muted">{VENDOR_DOCUMENT_HINTS[kind]}</p>
          {doc ? (
            <p className="mt-2 text-xs text-muted">
              <span className="font-medium text-foreground">{doc.fileName}</span>
              {" · "}
              Uploaded {safeFormatDateTime(doc.uploadedAt)}
            </p>
          ) : (
            <p className="mt-2 text-xs text-muted">No file uploaded yet.</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {doc?.url ? (
            <>
              <Button
                type="button"
                variant="secondary"
                className="rounded-full"
                data-attr={`vendor-documents-view-${kind}`}
                onClick={() => window.open(doc.url, "_blank", "noopener,noreferrer")}
              >
                View
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="rounded-full"
                data-attr={`vendor-documents-download-${kind}`}
                onClick={() => triggerDocumentDownload(doc.url, doc.fileName)}
              >
                Download
              </Button>
            </>
          ) : null}
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) onUpload(file);
            }}
          />
          <Button
            type="button"
            variant="primary"
            className="rounded-full"
            disabled={disabled || uploading}
            data-attr={`vendor-documents-upload-${kind}`}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? "Uploading…" : doc ? "Replace" : "Upload"}
          </Button>
          {doc ? (
            <Button
              type="button"
              variant="ghost"
              className="rounded-full text-danger"
              disabled={disabled || uploading}
              data-attr={`vendor-documents-remove-${kind}`}
              onClick={onRemove}
            >
              Remove
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Vendor Documents — insurance details + compliance file uploads for managers. */
export function VendorDocumentsPanel() {
  const { showToast } = useAppUi();
  const demo = isDemoModeActive();

  const [documents, setDocuments] = useState<VendorDocumentRecord[]>(() => (demo ? DEMO_DOCUMENTS : []));
  const [insuranceDraft, setInsuranceDraft] = useState<InsuranceDraft>(() => (demo ? DEMO_INSURANCE : EMPTY_INSURANCE));
  const [loading, setLoading] = useState(() => !demo);
  const [savingInsurance, setSavingInsurance] = useState(false);
  const [uploadingKind, setUploadingKind] = useState<VendorDocumentKind | null>(null);
  const [unlinked, setUnlinked] = useState(false);

  useEffect(() => {
    if (demo) return;
    void fetch("/api/vendor/documents", { credentials: "include" })
      .then((r) => r.json())
      .then(
        (data: {
          linked?: boolean;
          documents?: VendorDocumentRecord[];
          insuranceProvider?: string;
          insurancePolicyNumber?: string;
          insuranceExpiresAt?: string;
        }) => {
          setUnlinked(data.linked === false);
          if (Array.isArray(data.documents)) setDocuments(data.documents);
          setInsuranceDraft({
            insuranceProvider: data.insuranceProvider ?? "",
            insurancePolicyNumber: data.insurancePolicyNumber ?? "",
            insuranceExpiresAt: data.insuranceExpiresAt ?? "",
          });
        },
      )
      .finally(() => setLoading(false));
  }, [demo]);

  async function saveInsurance() {
    setSavingInsurance(true);
    try {
      if (demo) {
        showToast("Insurance details saved.");
        return;
      }
      const res = await fetch("/api/vendor/documents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(insuranceDraft),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save.");
      showToast("Insurance details saved.");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSavingInsurance(false);
    }
  }

  async function uploadDocument(kind: VendorDocumentKind, file: File) {
    if (file.size > MAX_UPLOAD_BYTES) {
      showToast("File must be 5 MB or smaller.");
      return;
    }
    setUploadingKind(kind);
    try {
      if (demo) {
        setDocuments((cur) => {
          const next = cur.filter((d) => d.kind !== kind);
          next.push({
            kind,
            fileName: file.name,
            url: URL.createObjectURL(file),
            uploadedAt: new Date().toISOString(),
          });
          return next;
        });
        showToast("Document uploaded.");
        return;
      }
      const dataUrl = await readFileAsDataUrl(file);
      const ext = file.name.split(".").pop()?.toLowerCase();
      const res = await fetch("/api/vendor/documents/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ dataUrl, kind, fileName: file.name, ext }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed.");
      if (Array.isArray(data.documents)) setDocuments(data.documents);
      showToast("Document uploaded.");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploadingKind(null);
    }
  }

  async function removeDocument(kind: VendorDocumentKind) {
    setUploadingKind(kind);
    try {
      if (demo) {
        setDocuments((cur) => cur.filter((d) => d.kind !== kind));
        showToast("Document removed.");
        return;
      }
      const res = await fetch("/api/vendor/documents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ removeKind: kind }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to remove.");
      if (Array.isArray(data.documents)) setDocuments(data.documents);
      showToast("Document removed.");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to remove.");
    } finally {
      setUploadingKind(null);
    }
  }

  return (
    <ManagerPortalPageShell title="Documents">
      <div className="space-y-6">
        {unlinked ? (
          <p className="rounded-xl border px-4 py-3 text-sm portal-banner-pending" data-attr="vendor-documents-unlinked-banner">
            Waiting on a property manager to connect with you — you&apos;ll be able to upload documents once linked.
          </p>
        ) : null}

        <section>
          <p className="text-sm font-semibold text-foreground">Insurance details</p>
          <p className="mt-1 text-xs text-muted">Policy information managers see alongside your certificate.</p>

          {loading ? (
            <p className="mt-4 text-sm text-muted">Loading…</p>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs font-medium text-muted sm:col-span-2">
                Insurance provider
                <Input
                  value={insuranceDraft.insuranceProvider}
                  onChange={(e) => setInsuranceDraft({ ...insuranceDraft, insuranceProvider: e.target.value })}
                  data-attr="vendor-documents-insurance-provider"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                Policy number
                <Input
                  value={insuranceDraft.insurancePolicyNumber}
                  onChange={(e) => setInsuranceDraft({ ...insuranceDraft, insurancePolicyNumber: e.target.value })}
                  data-attr="vendor-documents-insurance-policy"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                Coverage expires
                <Input
                  type="date"
                  value={insuranceDraft.insuranceExpiresAt}
                  onChange={(e) => setInsuranceDraft({ ...insuranceDraft, insuranceExpiresAt: e.target.value })}
                  data-attr="vendor-documents-insurance-expires"
                />
              </label>
            </div>
          )}

          <div className="mt-5">
            <Button
              variant="primary"
              onClick={() => void saveInsurance()}
              disabled={savingInsurance || loading || unlinked}
              data-attr="vendor-documents-insurance-save"
            >
              {savingInsurance ? "Saving…" : "Save insurance details"}
            </Button>
          </div>
        </section>

        <div className="border-t border-border" />

        <section>
          <p className="text-sm font-semibold text-foreground">Required documents</p>
          <p className="mt-1 text-xs text-muted">
            Upload what your manager requests — PDF or image files, up to 5 MB each. Items marked optional may not
            apply to every vendor.
          </p>

          {loading ? (
            <p className="mt-4 text-sm text-muted">Loading…</p>
          ) : (
            <div className="mt-4 space-y-8">
              {VENDOR_DOCUMENT_SECTIONS.map((section) => (
                <div key={section.id}>
                  <div className="mb-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{section.label}</p>
                    {section.description ? (
                      <p className="mt-1 text-xs text-muted">{section.description}</p>
                    ) : null}
                  </div>
                  <div>
                    {section.kinds.map((kind) => (
                      <DocumentRow
                        key={kind}
                        kind={kind}
                        doc={findVendorDocument(documents, kind)}
                        uploading={uploadingKind === kind}
                        disabled={unlinked}
                        onUpload={(file) => void uploadDocument(kind, file)}
                        onRemove={() => void removeDocument(kind)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </ManagerPortalPageShell>
  );
}
