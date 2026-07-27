"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  acceptForSlot,
  formatBytes,
  isAllowedApplicationPhotoMime,
  MAX_APPLICATION_PHOTO_BYTES,
  MAX_APPLICATION_PHOTO_SIZE_LABEL,
} from "@/lib/rental-application/application-photos";
import type { ApplicationPhotoAttachment, ApplicationPhotoSlot } from "@/lib/rental-application/types";

const DISPLAYABLE_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.readAsDataURL(file);
  });
}

async function uploadApplicationPhoto(params: {
  applicationId: string;
  slot: ApplicationPhotoSlot;
  file: File;
  email?: string;
}): Promise<{ ok: true; attachment: ApplicationPhotoAttachment } | { ok: false; error: string }> {
  if (params.file.size > MAX_APPLICATION_PHOTO_BYTES) {
    return { ok: false, error: `That file is too large. Keep it under ${MAX_APPLICATION_PHOTO_SIZE_LABEL}.` };
  }
  if (params.file.type && !isAllowedApplicationPhotoMime(params.file.type, params.slot)) {
    return { ok: false, error: "That file type isn’t supported. Use a JPG, PNG, or PDF." };
  }
  let dataUrl: string;
  try {
    dataUrl = await readFileAsDataUrl(params.file);
  } catch {
    return { ok: false, error: "Could not read the file. Please try again." };
  }
  try {
    const res = await fetch("/api/portal/application-photos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        applicationId: params.applicationId,
        slot: params.slot,
        dataUrl,
        fileName: params.file.name,
        email: params.email?.trim().toLowerCase() || undefined,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { attachment?: ApplicationPhotoAttachment; error?: string };
    if (!res.ok || !json.attachment) {
      return { ok: false, error: json.error || "Upload failed. Please try again." };
    }
    return { ok: true, attachment: json.attachment };
  } catch {
    return { ok: false, error: "Upload failed — check your connection and try again." };
  }
}

async function deleteApplicationPhoto(params: { applicationId: string; storagePath: string; email?: string }): Promise<void> {
  try {
    await fetch("/api/portal/application-photos", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        applicationId: params.applicationId,
        storagePath: params.storagePath,
        email: params.email?.trim().toLowerCase() || undefined,
      }),
    });
  } catch {
    // Best-effort: the reference is already gone from the form, so a failed
    // byte-delete only leaves an unreferenced object reclaimed by later sweeps.
  }
}

function readUrlFor(applicationId: string, slot: ApplicationPhotoSlot, index: number): string {
  const params = new URLSearchParams({ applicationId, slot, index: String(index) });
  return `/api/portal/application-photos?${params.toString()}`;
}

/** Preview: freshly-captured objectURL when we have one, else the authorized read route. */
function AttachmentPreview({
  attachment,
  localPreview,
  readUrl,
}: {
  attachment: ApplicationPhotoAttachment;
  localPreview: string | null;
  readUrl: string;
}) {
  const [failed, setFailed] = useState(false);
  // Only render an <img> for browser-displayable formats. A HEIC/PDF (even one
  // just captured) would show a broken image, so it falls through to the chip —
  // as does a read-route fetch that can't be served (e.g. a guest with no
  // session after re-mount), via onError.
  if (DISPLAYABLE_IMAGE_MIME.has(attachment.mimeType) && (localPreview || !failed)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={localPreview ?? readUrl}
        alt={attachment.fileName}
        onError={() => setFailed(true)}
        className="h-28 w-full rounded-lg border border-border object-cover [html[data-theme=dark]_&]:border-white/12"
      />
    );
  }
  return (
    <div className="flex h-28 w-full items-center justify-center rounded-lg border border-border bg-accent/30 text-center text-xs font-medium text-muted [html[data-theme=dark]_&]:border-white/12">
      <span className="px-3">
        {attachment.mimeType === "application/pdf" ? "PDF attached" : "File attached"}
        <br />
        {attachment.fileName}
      </span>
    </div>
  );
}

type SinglePhotoFieldProps = {
  slot: ApplicationPhotoSlot;
  index?: number;
  label: string;
  hint?: string;
  attachment: ApplicationPhotoAttachment | null;
  onChange: (next: ApplicationPhotoAttachment | null) => void;
  getApplicationId: () => string;
  email?: string;
  readOnly?: boolean;
  dataAttr?: string;
};

/** One capture-or-upload slot with preview, retake and remove. */
export function ApplicationPhotoField({
  slot,
  index = 0,
  label,
  hint,
  attachment,
  onChange,
  getApplicationId,
  email,
  readOnly,
  dataAttr,
}: SinglePhotoFieldProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);

  // Revoke object URLs on unmount / change to avoid leaks.
  useEffect(() => {
    return () => {
      if (localPreview) URL.revokeObjectURL(localPreview);
    };
  }, [localPreview]);

  const handleFile = useCallback(
    async (file: File | null | undefined) => {
      if (!file) return; // user cancelled the picker / camera — not an error
      setError(null);
      setBusy(true);
      const applicationId = getApplicationId();
      const previous = attachment;
      const result = await uploadApplicationPhoto({ applicationId, slot, file, email });
      if (!result.ok) {
        // A failed upload must never look like a success: leave the field as-is.
        setError(result.error);
        setBusy(false);
        return;
      }
      const nextPreview = URL.createObjectURL(file);
      setLocalPreview((old) => {
        if (old) URL.revokeObjectURL(old);
        return nextPreview;
      });
      onChange(result.attachment);
      setBusy(false);
      // Retake: reclaim the object we just replaced (best-effort).
      if (previous?.storagePath && previous.storagePath !== result.attachment.storagePath) {
        void deleteApplicationPhoto({ applicationId, storagePath: previous.storagePath, email });
      }
    },
    [attachment, email, getApplicationId, onChange, slot],
  );

  const handleRemove = useCallback(async () => {
    if (!attachment) return;
    setBusy(true);
    setError(null);
    const applicationId = getApplicationId();
    const removed = attachment;
    setLocalPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
    onChange(null); // remove from the form immediately so it is never submitted
    if (removed.storagePath) {
      await deleteApplicationPhoto({ applicationId, storagePath: removed.storagePath, email });
    }
    setBusy(false);
  }, [attachment, email, getApplicationId, onChange]);

  // Only resolves (never mints) an id here — an attachment already implies one exists.
  const readUrl = attachment ? readUrlFor(getApplicationId(), slot, index) : "";

  return (
    <div className="space-y-2" data-attr={dataAttr}>
      <p className="text-sm font-semibold text-foreground">{label}</p>
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}

      {attachment ? (
        <div className="space-y-2">
          <AttachmentPreview attachment={attachment} localPreview={localPreview} readUrl={readUrl} />
          {!readOnly ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                className="px-4 text-[13px]"
                disabled={busy}
                onClick={() => cameraInputRef.current?.click()}
                data-attr={dataAttr ? `${dataAttr}-retake` : undefined}
              >
                {busy ? "Working…" : "Retake"}
              </Button>
              <Button
                type="button"
                variant="danger"
                className="px-4 text-[13px]"
                disabled={busy}
                onClick={handleRemove}
                data-attr={dataAttr ? `${dataAttr}-remove` : undefined}
              >
                Remove
              </Button>
            </div>
          ) : null}
        </div>
      ) : readOnly ? (
        <p className="text-sm text-muted">Not provided</p>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              className="px-4 text-[13px]"
              disabled={busy}
              onClick={() => cameraInputRef.current?.click()}
              data-attr={dataAttr ? `${dataAttr}-camera` : undefined}
            >
              {busy ? "Uploading…" : "Take photo"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="px-4 text-[13px]"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
              data-attr={dataAttr ? `${dataAttr}-upload` : undefined}
            >
              Upload file
            </Button>
          </div>
        </div>
      )}

      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      {/* Camera-first input (opens the camera on a phone). */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(e) => {
          void handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {/* File picker (photo library or a file on desktop; PDF where allowed). */}
      <input
        ref={fileInputRef}
        type="file"
        accept={acceptForSlot(slot)}
        className="sr-only"
        onChange={(e) => {
          void handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}

type IncomeProofPhotosProps = {
  attachments: ApplicationPhotoAttachment[];
  onChange: (next: ApplicationPhotoAttachment[]) => void;
  getApplicationId: () => string;
  email?: string;
  readOnly?: boolean;
  max?: number;
};

/** A short list of proof-of-income documents built on {@link ApplicationPhotoField}. */
export function IncomeProofPhotos({
  attachments,
  onChange,
  getApplicationId,
  email,
  readOnly,
  max = 3,
}: IncomeProofPhotosProps) {
  const list = Array.isArray(attachments) ? attachments : [];
  const canAddMore = !readOnly && list.length < max;

  return (
    <div className="space-y-3">
      {list.map((attachment, i) => (
        <ApplicationPhotoField
          key={attachment.storagePath || i}
          slot="income"
          index={i}
          label={`Document ${i + 1} · ${attachment.fileName}${
            attachment.sizeBytes ? ` (${formatBytes(attachment.sizeBytes)})` : ""
          }`}
          attachment={attachment}
          onChange={(next) => {
            const copy = [...list];
            if (next) copy[i] = next;
            else copy.splice(i, 1);
            onChange(copy);
          }}
          getApplicationId={getApplicationId}
          email={email}
          readOnly={readOnly}
          dataAttr="application-income-proof"
        />
      ))}
      {canAddMore ? (
        <ApplicationPhotoField
          key={`add-${list.length}`}
          slot="income"
          index={list.length}
          label={list.length === 0 ? "Add a pay stub, offer letter, or bank statement" : "Add another document"}
          attachment={null}
          onChange={(next) => {
            if (next) onChange([...list, next]);
          }}
          getApplicationId={getApplicationId}
          email={email}
          dataAttr="application-income-proof-add"
        />
      ) : null}
    </div>
  );
}
