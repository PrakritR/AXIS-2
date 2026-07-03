"use client";

import { useRef, useState } from "react";
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
  PORTAL_TABLE_TR,
  PortalDataTableEmpty,
} from "@/components/portal/portal-data-table";
import { addUploadedOwnLease, type UploadedOwnLease } from "@/lib/resident-lease-upload";
import { safeFormatDateTime } from "@/lib/pacific-time";

const MAX_UPLOAD_BYTES = 3.5 * 1024 * 1024;

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
    setPreviewUrl(next.type.startsWith("image/") ? URL.createObjectURL(next) : null);
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

        <div className="flex justify-end gap-2 border-t border-border pt-4">
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

/** Documents › Other documents — table of the resident's own uploads. */
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
  return (
    <div className={PORTAL_DATA_TABLE_WRAP}>
      <div className={PORTAL_DATA_TABLE_SCROLL}>
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead>
            <tr className={PORTAL_TABLE_HEAD_ROW}>
              <th className={`${MANAGER_TABLE_TH} text-left`}>Name</th>
              <th className={`${MANAGER_TABLE_TH} text-left`}>Type</th>
              <th className={`${MANAGER_TABLE_TH} text-left`}>Date added</th>
              <th className={`${MANAGER_TABLE_TH} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {uploads.map((row) => (
              <tr key={row.id} className={PORTAL_TABLE_TR}>
                <td className={`${PORTAL_TABLE_TD} align-middle`}>
                  <p className="min-w-0 max-w-[320px] truncate font-medium text-foreground" title={row.fileName}>
                    {row.fileName}
                  </p>
                </td>
                <td className={`${PORTAL_TABLE_TD} align-middle`}>{uploadedDocumentKind(row)}</td>
                <td className={`${PORTAL_TABLE_TD} align-middle`}>{safeFormatDateTime(row.uploadedAt)}</td>
                <td className={`${PORTAL_TABLE_TD} align-middle`}>
                  <div className="flex items-center justify-end gap-3 whitespace-nowrap">
                    <a
                      href={row.dataUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-semibold text-primary hover:underline"
                    >
                      View
                    </a>
                    <a
                      href={row.dataUrl}
                      download={row.fileName}
                      className="text-xs font-semibold text-primary hover:underline"
                    >
                      Download
                    </a>
                    <button
                      type="button"
                      className="text-xs font-semibold text-danger hover:underline"
                      onClick={() => onRemove(row.id)}
                    >
                      Remove
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
