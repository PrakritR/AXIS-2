"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Modal, MODAL_FIELD_LABEL_CLASS } from "@/components/ui/modal";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { useNativeCamera } from "@/lib/native/use-native-camera";
import { MANAGER_TABLE_TH } from "@/components/portal/portal-metrics";
import {
  PORTAL_DATA_TABLE_SCROLL,
  PORTAL_DATA_TABLE_WRAP,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_TD,
  PORTAL_TABLE_TR_EXPANDABLE,
  PortalDataTableEmpty,
  PortalMobileSummaryCard,
} from "@/components/portal/portal-data-table";
import { addUploadedOwnLease, type UploadedOwnLease } from "@/lib/resident-lease-upload";
import { safeFormatDateTime } from "@/lib/pacific-time";

const MAX_UPLOAD_BYTES = 3.5 * 1024 * 1024;

// `URL.createObjectURL()` returns a `blob:` URL, while Capacitor camera previews
// may be custom schemes or WebView-local `http(s)://localhost` file URLs.
// Reject anything else before it reaches the live upload preview's <img src>,
// so this can never become a sink for an untrusted/remote URL.
const SAFE_PREVIEW_URL_RE = /^(?:(?:blob|capacitor|file):|https?:\/\/localhost(?::\d+)?(?:[/?#]|$))/i;

/** Trigger a browser download without opening a blank tab. */
export function triggerDocumentDownload(href: string, fileName?: string): void {
  const anchor = document.createElement("a");
  anchor.href = href;
  if (fileName) anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

/**
 * Inline document view rendered BELOW a Documents table when a row is clicked —
 * the lease/application-style presentation (rendered document in an embedded
 * frame with a Download action alongside), never a modal or a new tab.
 */
export function DocumentInlineViewer({
  title,
  src,
  srcDoc,
  onClose,
  onDownload,
  extraActions,
  children,
}: {
  title: string;
  /** Same-origin PDF URL (or data URL) rendered via iframe src. */
  src?: string | null;
  /** Clean document HTML rendered via iframe srcDoc. */
  srcDoc?: string | null;
  onClose: () => void;
  onDownload: () => void;
  /** Optional extra buttons rendered before Close/Download (e.g. Remove). */
  extraActions?: ReactNode;
  /** Custom frame content (e.g. an image) used instead of the iframe. */
  children?: ReactNode;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  useEffect(() => {
    sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [title, src, srcDoc]);

  return (
    <section ref={sectionRef} className="mt-6">
      <div className="flex flex-wrap items-center justify-start gap-3">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground" title={title}>
          {title}
        </p>
        <div className="flex items-center gap-2">
          {extraActions}
          <Button type="button" variant="outline" className="rounded-full" onClick={onClose}>
            Close
          </Button>
          <Button type="button" className="rounded-full" data-attr="resident-document-download" onClick={onDownload}>
            Download
          </Button>
        </div>
      </div>
      <div className="mt-3 overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
        {children ? (
          children
        ) : src ? (
          <iframe src={src} title={title} className="h-[720px] w-full border-0 bg-white" />
        ) : srcDoc ? (
          <iframe
            srcDoc={srcDoc}
            title={title}
            sandbox="allow-same-origin"
            loading="lazy"
            className="h-[720px] w-full border-0 bg-white"
          />
        ) : (
          <div className="flex h-64 items-center justify-center px-4 text-center text-sm text-neutral-500">
            This document isn&apos;t available yet.
          </div>
        )}
      </div>
    </section>
  );
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}

/** Human-readable kind derived from the stored data URL's mime type. */
export function uploadedDocumentKind(row: UploadedOwnLease): string {
  const mime = /^data:([^;,]+)/.exec(row.dataUrl)?.[1] ?? "";
  if (mime.startsWith("image/")) return "Photo";
  if (mime === "application/pdf") return "PDF";
  return "Document";
}

export type AddDocumentMode = "photo" | "document";

/**
 * Popup for the Documents page's top-right "Add photo" / "Add document"
 * actions. Saves into the same per-resident uploads store as the legacy
 * "Document photos" card, so older photo uploads keep appearing in the
 * Other documents table.
 *
 * Render with a `key` derived from `mode` so each open starts from a fresh
 * form (there is no internal reset).
 */
export function ResidentAddDocumentModal({
  mode,
  email,
  onClose,
  onAdded,
}: {
  /** null keeps the modal closed. */
  mode: AddDocumentMode | null;
  email: string;
  onClose: () => void;
  onAdded: (row: UploadedOwnLease) => void;
}) {
  const { showToast } = useAppUi();
  const { capture } = useNativeCamera();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);

  const isPhoto = mode === "photo";

  const pickFile = (next: File | null | undefined) => {
    if (!next) return;
    if (next.size > MAX_UPLOAD_BYTES) {
      showToast("File is too large (max 3.5 MB).");
      return;
    }
    setFile(next);
    if (!next.type.startsWith("image/")) {
      setPreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(next);
    if (!SAFE_PREVIEW_URL_RE.test(objectUrl)) {
      setPreviewUrl(null);
      return;
    }
    setPreviewUrl(objectUrl);
  };

  const onCapturePhoto = async () => {
    try {
      const photo = await capture();
      if (!photo) return;
      if (photo.file.size > MAX_UPLOAD_BYTES) {
        showToast("Photo is too large (max 3.5 MB).");
        return;
      }
      setFile(photo.file);
      if (!SAFE_PREVIEW_URL_RE.test(photo.previewUrl)) {
        setPreviewUrl(null);
        return;
      }
      setPreviewUrl(photo.previewUrl);
    } catch {
      showToast("Could not capture photo.");
    }
  };

  const onSave = async () => {
    if (!file) {
      showToast(isPhoto ? "Add a photo first." : "Choose a file first.");
      return;
    }
    if (!email) {
      showToast("Sign in to upload documents.");
      return;
    }
    setBusy(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      const name = label.trim() || file.name || `document-${Date.now()}`;
      const row = addUploadedOwnLease(email, {
        dataUrl,
        fileName: name,
        uploadedAt: new Date().toISOString(),
      });
      if (!row) {
        showToast("Could not save document.");
        return;
      }
      showToast(isPhoto ? "Photo added to Other documents." : "Document added to Other documents.");
      onAdded(row);
      onClose();
    } catch {
      showToast("Could not read the file.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={mode !== null} title={isPhoto ? "Add photo" : "Add document"} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-muted">
          {isPhoto
            ? "Scan or photograph lease pages, IDs, or other paperwork. On the mobile app this opens your camera; on the web you can choose a photo from your device."
            : "Upload a PDF or file you want to keep with your housing records. It appears in the Other documents tab."}
        </p>

        {!isPhoto ? (
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,image/*,.doc,.docx,.txt,.csv"
            className="sr-only"
            aria-hidden
            onChange={(e) => pickFile(e.target.files?.[0])}
          />
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            disabled={busy}
            onClick={() => (isPhoto ? void onCapturePhoto() : fileRef.current?.click())}
          >
            {file ? (isPhoto ? "Retake photo" : "Choose a different file") : isPhoto ? "Take or choose photo" : "Choose file"}
          </Button>
          {file ? (
            <p className="min-w-0 truncate text-sm text-muted" title={file.name}>
              {file.name}
            </p>
          ) : null}
        </div>

        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="Preview" className="max-h-56 w-full rounded-xl border border-border object-contain" />
        ) : null}

        <label className="block">
          <span className={MODAL_FIELD_LABEL_CLASS}>Name (optional)</span>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={isPhoto ? "e.g. Move-in photos — bedroom" : "e.g. Renter's insurance policy"}
            className="mt-1.5 h-10 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/25"
          />
        </label>

        <div className="flex justify-start gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" className="rounded-full" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" className="rounded-full" onClick={() => void onSave()} disabled={busy || !file}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** Mime type parsed from the upload's data URL. */
function uploadedMimeType(row: UploadedOwnLease): string {
  return /^data:([^;,]+)/.exec(row.dataUrl)?.[1] ?? "";
}

/**
 * Decode a base64 data URL's payload to plain text, for safe (escaped) React
 * rendering. Never returns markup — callers must render the result as text
 * (e.g. inside a `<pre>`), never via innerHTML/srcDoc/iframe src.
 */
function decodeDataUrlText(dataUrl: string): string | null {
  const match = /^data:[^;,]*;base64,([\s\S]*)$/.exec(dataUrl);
  if (!match) return null;
  try {
    const binary = atob(match[1]);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return null;
  }
}

/** Documents › Other documents — table of the resident's own uploads; clicking a row opens it inline below. */
export function ResidentOtherDocumentsTable({
  uploads,
  loading,
  onRemove,
  emptyMessage = "No documents yet — use Add photo or Add document above.",
}: {
  uploads: UploadedOwnLease[];
  loading: boolean;
  onRemove: (id: string) => void;
  emptyMessage?: string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(
    () => (selectedId ? uploads.find((row) => row.id === selectedId) ?? null : null),
    [uploads, selectedId],
  );

  if (loading) {
    return (
      <div className={PORTAL_DATA_TABLE_WRAP}>
        <div className="flex items-center justify-center px-6 py-16 text-sm text-muted">Loading documents…</div>
      </div>
    );
  }
  if (uploads.length === 0) {
    return <PortalDataTableEmpty icon="default" message={emptyMessage} />;
  }

  const selectedMime = selected ? uploadedMimeType(selected) : "";
  const selectedIsImage = selectedMime.startsWith("image/");
  const selectedIsPdf = selectedMime === "application/pdf";
  // Plain-text previews are rendered as escaped text (never framed as HTML) —
  // an uploaded file's declared mime type is attacker-controlled, so a
  // "text/html" upload must never reach an iframe `src`/`srcDoc`.
  const selectedIsText = selectedMime.startsWith("text/");
  const selectedText = selected && selectedIsText ? decodeDataUrlText(selected.dataUrl) : null;

  return (
    <>
      <div className="space-y-2 lg:hidden">
        {uploads.map((row) => (
          <PortalMobileSummaryCard
            key={row.id}
            title={row.fileName}
            subtitle={`${uploadedDocumentKind(row)} · added ${safeFormatDateTime(row.uploadedAt)}`}
            onClick={() => setSelectedId(row.id)}
          />
        ))}
      </div>
      <div className={`${PORTAL_DATA_TABLE_WRAP} hidden lg:block`}>
        <div className={PORTAL_DATA_TABLE_SCROLL}>
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className={PORTAL_TABLE_HEAD_ROW}>
                <th className={`${MANAGER_TABLE_TH} text-left`}>Name</th>
                <th className={`${MANAGER_TABLE_TH} text-left`}>Type</th>
                <th className={`${MANAGER_TABLE_TH} text-left`}>Date added</th>
              </tr>
            </thead>
            <tbody>
              {uploads.map((row) => (
                <tr key={row.id} className={PORTAL_TABLE_TR_EXPANDABLE} onClick={() => setSelectedId(row.id)}>
                  <td className={`${PORTAL_TABLE_TD} align-middle`}>
                    <p className="min-w-0 max-w-[320px] truncate font-medium text-foreground" title={row.fileName}>
                      {row.fileName}
                    </p>
                  </td>
                  <td className={`${PORTAL_TABLE_TD} align-middle`}>{uploadedDocumentKind(row)}</td>
                  <td className={`${PORTAL_TABLE_TD} align-middle`}>{safeFormatDateTime(row.uploadedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {selected ? (
        <DocumentInlineViewer
          title={selected.fileName}
          src={selectedIsPdf ? selected.dataUrl : null}
          onClose={() => setSelectedId(null)}
          onDownload={() => triggerDocumentDownload(selected.dataUrl, selected.fileName)}
          extraActions={
            <Button
              type="button"
              variant="outline"
              className="rounded-full text-danger"
              onClick={() => {
                setSelectedId(null);
                onRemove(selected.id);
              }}
            >
              Remove
            </Button>
          }
        >
          {selectedIsImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={selected.dataUrl}
              alt={selected.fileName}
              className="max-h-[720px] w-full bg-white object-contain"
            />
          ) : selectedIsText ? (
            <pre className="max-h-[720px] overflow-auto whitespace-pre-wrap break-words bg-white p-4 text-sm text-foreground">
              {selectedText ?? "Preview isn't available for this file — use Download to open it."}
            </pre>
          ) : selectedIsPdf ? null : (
            <div className="flex h-64 items-center justify-center px-4 text-center text-sm text-neutral-500">
              Preview isn&apos;t available for this file type — use Download to open it.
            </div>
          )}
        </DocumentInlineViewer>
      ) : null}
    </>
  );
}
