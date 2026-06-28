"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { usePortalSession } from "@/hooks/use-portal-session";
import { useNativeCamera } from "@/lib/native/use-native-camera";
import {
  addUploadedOwnLease,
  readUploadedOwnLeases,
  removeUploadedOwnLease,
  syncUploadedOwnLeasesFromServer,
  type UploadedOwnLease,
} from "@/lib/resident-lease-upload";
import { PORTAL_SECTION_SURFACE } from "@/components/portal/portal-metrics";

const MAX_PHOTO_BYTES = 3.5 * 1024 * 1024;

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read photo."));
    reader.readAsDataURL(file);
  });
}

export function ResidentDocumentPhotos() {
  const { showToast } = useAppUi();
  const session = usePortalSession();
  const { capture } = useNativeCamera();
  const email = session.email?.trim().toLowerCase() ?? "";
  const [uploads, setUploads] = useState<UploadedOwnLease[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!email) {
      setUploads([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rows = await syncUploadedOwnLeasesFromServer(email);
      setUploads(rows);
    } finally {
      setLoading(false);
    }
  }, [email]);

  useEffect(() => {
    queueMicrotask(() => void refresh());
  }, [refresh]);

  const onCapture = async () => {
    if (!email) {
      showToast("Sign in to upload documents.");
      return;
    }
    setBusy(true);
    try {
      const photo = await capture();
      if (!photo) return;
      if (photo.file.size > MAX_PHOTO_BYTES) {
        showToast("Photo is too large (max 3.5 MB).");
        return;
      }
      const dataUrl = await fileToDataUrl(photo.file);
      const row = addUploadedOwnLease(email, {
        dataUrl,
        fileName: photo.file.name || `document-${Date.now()}.jpg`,
        uploadedAt: new Date().toISOString(),
      });
      if (!row) {
        showToast("Could not save photo.");
        return;
      }
      setUploads(readUploadedOwnLeases(email));
      showToast("Document photo saved.");
    } catch {
      showToast("Could not capture photo.");
    } finally {
      setBusy(false);
    }
  };

  const onRemove = (id: string) => {
    if (!email) return;
    removeUploadedOwnLease(email, id);
    setUploads(readUploadedOwnLeases(email));
    showToast("Removed.");
  };

  return (
    <Card className={`${PORTAL_SECTION_SURFACE} mt-6 p-4 sm:p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Document photos</p>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted">
            Scan or photograph lease pages, IDs, or other paperwork. On the mobile app this opens your camera; on the web
            you can choose a photo from your device.
          </p>
        </div>
        <Button type="button" className="shrink-0 rounded-full" disabled={busy || !email} onClick={() => void onCapture()}>
          {busy ? "Saving…" : "Add photo"}
        </Button>
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-muted">Loading uploads…</p>
      ) : uploads.length === 0 ? (
        <p className="mt-4 text-sm text-muted">No document photos yet.</p>
      ) : (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {uploads.map((row) => (
            <li key={row.id} className="overflow-hidden rounded-xl border border-border bg-card">
              <a href={row.dataUrl} target="_blank" rel="noreferrer" className="block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={row.dataUrl} alt={row.fileName} className="aspect-[4/3] w-full object-cover" />
              </a>
              <div className="flex items-center justify-between gap-2 border-t border-border px-2 py-1.5">
                <p className="min-w-0 truncate text-[10px] text-muted" title={row.fileName}>
                  {row.fileName}
                </p>
                <button
                  type="button"
                  className="shrink-0 text-[10px] font-semibold text-rose-700 hover:underline"
                  onClick={() => onRemove(row.id)}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
