"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { ManagerPortalPageShell } from "@/components/portal/portal-metrics";
import { PortalCollapsibleSection } from "@/components/portal/portal-collapsible-section";
import { DocumentInlineViewer, triggerDocumentDownload } from "@/components/portal/resident-other-documents";
import { isDemoModeActive } from "@/lib/demo/demo-session";
import { safeFormatDateTime } from "@/lib/pacific-time";
import {
  VENDOR_DOCUMENT_HINTS,
  VENDOR_DOCUMENT_LABELS,
  VENDOR_DOCUMENT_SECTIONS,
  type VendorDocumentKind,
  type VendorDocumentRecord,
} from "@/lib/vendor-documents";

const DEMO_VENDOR_DOCUMENTS: VendorDocumentRecord[] = [
  {
    kind: "w9",
    fileName: "cascade-mechanical-w9.pdf",
    url: "/api/vendor/documents/file?kind=w9",
    uploadedAt: new Date(Date.now() - 120 * 86_400_000).toISOString(),
  },
  {
    kind: "insurance",
    fileName: "general-liability-certificate.pdf",
    url: "/api/vendor/documents/file?kind=insurance",
    uploadedAt: new Date(Date.now() - 45 * 86_400_000).toISOString(),
  },
  {
    kind: "license",
    fileName: "wa-contractor-license.pdf",
    url: "/api/vendor/documents/file?kind=license",
    uploadedAt: new Date(Date.now() - 200 * 86_400_000).toISOString(),
  },
];

type DocumentsPayload = {
  linked?: boolean;
  documents?: VendorDocumentRecord[];
};

/** Vendor Documents — compliance PDFs (W-9, insurance, licenses, tax forms). */
export function VendorDocumentsPanel() {
  const { showToast } = useAppUi();
  const demo = isDemoModeActive();
  const fileRefs = useRef<Partial<Record<VendorDocumentKind, HTMLInputElement | null>>>({});

  const [documents, setDocuments] = useState<VendorDocumentRecord[]>(() => (demo ? DEMO_VENDOR_DOCUMENTS : []));
  const [loading, setLoading] = useState(!demo);
  const [uploadingKind, setUploadingKind] = useState<VendorDocumentKind | null>(null);
  const [previewKind, setPreviewKind] = useState<VendorDocumentKind | null>(null);
  const [unlinked, setUnlinked] = useState(false);

  const loadDocuments = useCallback(async () => {
    if (demo) {
      setDocuments(DEMO_VENDOR_DOCUMENTS);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/vendor/documents", { credentials: "include" });
      const data = (await res.json()) as DocumentsPayload & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load documents.");
      setUnlinked(data.linked === false);
      setDocuments(data.documents ?? []);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to load documents.");
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  }, [demo, showToast]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  const documentsByKind = useMemo(() => {
    const map = new Map<VendorDocumentKind, VendorDocumentRecord>();
    for (const doc of documents) map.set(doc.kind, doc);
    return map;
  }, [documents]);

  const previewDoc = previewKind ? documentsByKind.get(previewKind) : undefined;

  const uploadFile = async (kind: VendorDocumentKind, file: File) => {
    if (demo) {
      setDocuments((cur) => {
        const next = cur.filter((d) => d.kind !== kind);
        next.push({
          kind,
          fileName: file.name,
          url: `/api/vendor/documents/file?kind=${encodeURIComponent(kind)}`,
          uploadedAt: new Date().toISOString(),
        });
        return next;
      });
      showToast(`${VENDOR_DOCUMENT_LABELS[kind]} saved (demo).`);
      return;
    }
    setUploadingKind(kind);
    try {
      const body = new FormData();
      body.set("kind", kind);
      body.set("file", file);
      const res = await fetch("/api/vendor/documents/upload", { method: "POST", credentials: "include", body });
      const data = (await res.json()) as { documents?: VendorDocumentRecord[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Upload failed.");
      setDocuments(data.documents ?? []);
      showToast(`${VENDOR_DOCUMENT_LABELS[kind]} uploaded.`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploadingKind(null);
    }
  };

  const removeDocument = async (kind: VendorDocumentKind) => {
    if (demo) {
      setDocuments((cur) => cur.filter((d) => d.kind !== kind));
      if (previewKind === kind) setPreviewKind(null);
      showToast("Document removed (demo).");
      return;
    }
    try {
      const res = await fetch("/api/vendor/documents", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ removeKind: kind }),
      });
      const data = (await res.json()) as { documents?: VendorDocumentRecord[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not remove document.");
      setDocuments(data.documents ?? []);
      if (previewKind === kind) setPreviewKind(null);
      showToast("Document removed.");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not remove document.");
    }
  };

  return (
    <ManagerPortalPageShell title="Documents">
      {unlinked ? (
        <p
          className="mb-4 rounded-xl border px-4 py-3 text-sm portal-banner-pending"
          data-attr="vendor-documents-unlinked-banner"
        >
          Waiting on a property manager to connect with you — upload documents here so managers can review your compliance files.
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted">Loading documents…</p>
      ) : (
        <div className="space-y-6">
          {VENDOR_DOCUMENT_SECTIONS.map((section) => (
            <PortalCollapsibleSection
              key={section.id}
              title={section.label}
              subtitle={section.description}
              surfaceMuted={false}
              contentClassName="px-4 pb-4"
              toggleDataAttr={`vendor-documents-section-${section.id}`}
            >
              <ul className="space-y-3">
                {section.kinds.map((kind) => {
                  const doc = documentsByKind.get(kind);
                  const busy = uploadingKind === kind;
                  return (
                    <li
                      key={kind}
                      className="flex flex-col gap-3 rounded-xl border border-border bg-accent/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-foreground">{VENDOR_DOCUMENT_LABELS[kind]}</p>
                        <p className="mt-0.5 text-xs text-muted">{VENDOR_DOCUMENT_HINTS[kind]}</p>
                        {doc ? (
                          <p className="mt-1 truncate text-xs text-muted">
                            {doc.fileName} · uploaded {safeFormatDateTime(doc.uploadedAt)}
                          </p>
                        ) : (
                          <p className="mt-1 text-xs font-medium text-muted">No file on file</p>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {doc ? (
                          <>
                            <Button
                              type="button"
                              variant="outline"
                              className="rounded-full"
                              data-attr={`vendor-documents-view-${kind}`}
                              onClick={() => setPreviewKind((cur) => (cur === kind ? null : kind))}
                            >
                              {previewKind === kind ? "Hide" : "View"}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              className="rounded-full"
                              data-attr={`vendor-documents-download-${kind}`}
                              onClick={() => {
                                if (demo) {
                                  showToast("Download is available after you sign in to a live vendor account.");
                                  return;
                                }
                                triggerDocumentDownload(doc.url, doc.fileName);
                              }}
                            >
                              Download
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              className="rounded-full text-danger"
                              data-attr={`vendor-documents-remove-${kind}`}
                              onClick={() => void removeDocument(kind)}
                            >
                              Remove
                            </Button>
                          </>
                        ) : null}
                        <Button
                          type="button"
                          variant="primary"
                          className="rounded-full"
                          disabled={busy}
                          data-attr={`vendor-documents-upload-${kind}`}
                          onClick={() => fileRefs.current[kind]?.click()}
                        >
                          {busy ? "Uploading…" : doc ? "Replace" : "Upload PDF"}
                        </Button>
                        <input
                          ref={(el) => {
                            fileRefs.current[kind] = el;
                          }}
                          type="file"
                          accept="application/pdf"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            e.target.value = "";
                            if (file) void uploadFile(kind, file);
                          }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </PortalCollapsibleSection>
          ))}
        </div>
      )}

      {previewDoc && previewKind ? (
        <DocumentInlineViewer
          title={VENDOR_DOCUMENT_LABELS[previewKind]}
          src={demo ? null : previewDoc.url}
          onDownload={() => {
            if (demo) {
              showToast("PDF preview is available on a live vendor account.");
              return;
            }
            triggerDocumentDownload(previewDoc.url, previewDoc.fileName);
          }}
          downloadLabel="Download PDF"
          downloadAttr={`vendor-documents-inline-download-${previewKind}`}
        >
          {demo ? (
            <div className="flex h-64 items-center justify-center px-4 text-center text-sm text-muted">
              Sample PDFs are listed above in the demo — sign in to a live vendor account to upload and preview real files.
            </div>
          ) : null}
        </DocumentInlineViewer>
      ) : null}
    </ManagerPortalPageShell>
  );
}
