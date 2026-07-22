"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal, MODAL_FIELD_LABEL_CLASS } from "@/components/ui/modal";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { useNativeCamera } from "@/lib/native/use-native-camera";
import { MANAGER_TABLE_TH } from "@/components/portal/portal-metrics";
import type { ManagerDocumentDTO } from "@/lib/documents/manager-documents";
import { PORTAL_DATA_TABLE, PORTAL_DATA_TABLE_SCROLL,
  PORTAL_DATA_TABLE_WRAP,
  PORTAL_TABLE_DETAIL_CELL,
  PORTAL_TABLE_DETAIL_ROW,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_TD,
  PORTAL_TABLE_TR_EXPANDABLE,
  PortalDataTableEmpty,
  PortalMobileSummaryCard,
  PortalTableDetailActions,
  PortalTableInlineExpand,} from "@/components/portal/portal-data-table";
import { addUploadedOwnLease, type UploadedOwnLease } from "@/lib/resident-lease-upload";
import { safeFormatDateTime } from "@/lib/pacific-time";

const MAX_UPLOAD_BYTES = 3.5 * 1024 * 1024;

// Accepted upload types — unchanged from the previous "Add document" flow, which
// already accepted images (`image/*`). Merging the old "Add photo" + "Add
// document" buttons into one "Add" must NOT widen this set: the union of both
// old flows is exactly this list (photos were always allowed here).
const UPLOAD_ACCEPT = "application/pdf,image/*,.doc,.docx,.txt,.csv";

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
  onDownload,
  extraActions,
  children,
  downloadLabel = "Download",
  downloadAttr = "resident-document-download",
  /** When true, omits outer margin and uses the portal table detail action strip. */
  embedded = false,
}: {
  /** Used for iframe/img accessibility only — not shown in the UI. */
  title: string;
  /** Same-origin PDF URL (or data URL) rendered via iframe src. */
  src?: string | null;
  /** Clean document HTML rendered via iframe srcDoc. */
  srcDoc?: string | null;
  onDownload: () => void;
  /** Optional extra actions after Download (e.g. Remove). */
  extraActions?: ReactNode;
  /** Custom frame content (e.g. an image) used instead of the iframe. */
  children?: ReactNode;
  /** Label for the download action; defaults to "Download". */
  downloadLabel?: string;
  /** data-attr override for the download button. */
  downloadAttr?: string;
  embedded?: boolean;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  useEffect(() => {
    sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [title, src, srcDoc]);

  const downloadButton = (
    <Button type="button" className={embedded ? undefined : "rounded-full"} data-attr={downloadAttr} onClick={onDownload}>
      {downloadLabel}
    </Button>
  );

  return (
    <section ref={sectionRef} className={embedded ? undefined : "mt-6"}>
      {embedded ? (
        <PortalTableDetailActions placement="top">
          {downloadButton}
          {extraActions}
        </PortalTableDetailActions>
      ) : (
        <div
          data-portal-detail-actions=""
          className="mb-6 flex flex-wrap items-center gap-3 border-b border-border py-6 sm:gap-4"
        >
          {downloadButton}
          {extraActions}
        </div>
      )}
      <div className={`overflow-hidden rounded-2xl border border-border bg-white shadow-sm${embedded ? " mt-4" : ""}`}>
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

/** Human-readable kind derived from a mime type. */
export function documentKindFromMime(mime: string): string {
  if (mime.startsWith("image/")) return "Photo";
  if (mime === "application/pdf") return "PDF";
  return "Document";
}

/** Human-readable kind derived from the stored data URL's mime type. */
export function uploadedDocumentKind(row: UploadedOwnLease): string {
  return documentKindFromMime(/^data:([^;,]+)/.exec(row.dataUrl)?.[1] ?? "");
}

/**
 * Popup for the Documents page's top-right "Add" action. One form accepts any
 * supported file — a photo, PDF, or document — with the type inferred from what
 * the user picks (`documentKindFromMime`), never chosen up front. Saves into the
 * same per-resident uploads store as the legacy "Document photos" card, so older
 * photo uploads keep appearing in the Other documents table. "Take photo" keeps
 * the native camera capability; both inputs feed the same {@link UPLOAD_ACCEPT}
 * set, so the merge does not widen accepted types.
 *
 * Render with a `key` derived from `open` so each open starts from a fresh form
 * (there is no internal reset).
 */
export function ResidentAddDocumentModal({
  open,
  email,
  onClose,
  onAdded,
}: {
  /** false keeps the modal closed. */
  open: boolean;
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
      showToast("Choose a file first.");
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
      showToast("Added to Other documents.");
      onAdded(row);
      onClose();
    } catch {
      showToast("Could not read the file.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} title="Add to documents" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-muted">
          Upload a photo, PDF, or file you want to keep with your housing records. It appears in the Other documents tab.
        </p>

        <input
          ref={fileRef}
          type="file"
          accept={UPLOAD_ACCEPT}
          className="sr-only"
          aria-hidden
          onChange={(e) => pickFile(e.target.files?.[0])}
        />

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            {file ? "Choose a different file" : "Choose file"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            disabled={busy}
            onClick={() => void onCapturePhoto()}
          >
            Take photo
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
            placeholder="e.g. Renter's insurance policy"
            className="mt-1.5 h-10 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/25"
          />
        </label>

        <div className="flex justify-start gap-2 border-t border-border pt-4">
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

const SHARED_DOCUMENTS_LIST_URL = "/api/resident/shared-documents";
const SHARED_DOCUMENTS_SIGNED_URL_BASE = "/api/resident/shared-documents";

/** One row in the merged Other-documents table — a resident's own upload or a manager-shared document. */
type CombinedDocRow =
  | { source: "own"; id: string; name: string; kind: string; dateIso: string; upload: UploadedOwnLease }
  | { source: "shared"; id: string; name: string; kind: string; dateIso: string; doc: ManagerDocumentDTO };

/**
 * Documents › Other documents — the resident's own uploads AND documents a
 * manager shared with them, in ONE table (the former "Shared with you" tab was
 * folded in here). The Source column keeps the two apart ("You" vs "Shared")
 * without a second tab; clicking a row opens it inline below.
 *
 * Shared rows come from the exact same endpoint + signed-URL preview the
 * standalone tab used, so this merge is presentation only — it changes nothing
 * about which documents the resident can see.
 */
export function ResidentOtherDocumentsTable({
  uploads,
  loading,
  onRemove,
  demo = false,
  emptyMessage = "No documents yet. Use Add above to upload one — anything your manager shares with you will appear here too.",
}: {
  uploads: UploadedOwnLease[];
  loading: boolean;
  onRemove: (id: string) => void;
  demo?: boolean;
  emptyMessage?: string;
}) {
  const { showToast } = useAppUi();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sharedDocs, setSharedDocs] = useState<ManagerDocumentDTO[]>([]);
  const [sharedLoading, setSharedLoading] = useState(!demo);

  // Documents a manager shared with this resident — the same list the standalone
  // "Shared with you" tab used to fetch. Skipped in the /demo sandbox, where the
  // initial state (empty list, not loading) is already the right answer.
  useEffect(() => {
    if (demo) return;
    let cancelled = false;
    setSharedLoading(true);
    void fetch(SHARED_DOCUMENTS_LIST_URL, { credentials: "include" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Failed to load shared documents.");
        if (!cancelled) setSharedDocs((data.documents as ManagerDocumentDTO[]) ?? []);
      })
      .catch((e) => {
        if (!cancelled) showToast(e instanceof Error ? e.message : "Failed to load shared documents.");
      })
      .finally(() => {
        if (!cancelled) setSharedLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [demo, showToast]);

  const rows = useMemo<CombinedDocRow[]>(() => {
    const own: CombinedDocRow[] = uploads.map((u) => ({
      source: "own",
      id: `own:${u.id}`,
      name: u.fileName,
      kind: uploadedDocumentKind(u),
      dateIso: u.uploadedAt,
      upload: u,
    }));
    const shared: CombinedDocRow[] = sharedDocs.map((d) => ({
      source: "shared",
      id: `shared:${d.id}`,
      name: d.displayName,
      kind: documentKindFromMime(d.mimeType),
      dateIso: d.createdAt,
      doc: d,
    }));
    return [...own, ...shared].sort((a, b) => String(b.dateIso).localeCompare(String(a.dateIso)));
  }, [uploads, sharedDocs]);

  const selected = useMemo(
    () => (selectedId ? rows.find((row) => row.id === selectedId) ?? null : null),
    [rows, selectedId],
  );

  // Shared docs are private storage objects — fetch a fresh signed URL when one
  // is opened, exactly like the old Shared-with-you preview. Own uploads carry
  // their bytes inline (data URL) and need no fetch.
  const selectedSharedId = selected?.source === "shared" ? selected.doc.id : null;
  const [sharedUrl, setSharedUrl] = useState<string | null>(null);
  const [sharedUrlLoading, setSharedUrlLoading] = useState(false);
  useEffect(() => {
    if (!selectedSharedId) {
      setSharedUrl(null);
      setSharedUrlLoading(false);
      return;
    }
    let cancelled = false;
    setSharedUrl(null);
    setSharedUrlLoading(true);
    void fetch(`${SHARED_DOCUMENTS_SIGNED_URL_BASE}/${selectedSharedId}/signed-url`, { credentials: "include" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Could not load preview.");
        if (!cancelled) setSharedUrl(String(data.url ?? ""));
      })
      .catch((e) => {
        if (!cancelled) showToast(e instanceof Error ? e.message : "Could not load preview.");
      })
      .finally(() => {
        if (!cancelled) setSharedUrlLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSharedId, showToast]);

  const toggleRow = (id: string) => setSelectedId((cur) => (cur === id ? null : id));

  if (rows.length === 0) {
    if (loading || sharedLoading) {
      return (
        <div className={PORTAL_DATA_TABLE_WRAP}>
          <div className="flex items-center justify-center px-6 py-16 text-sm text-muted">Loading documents…</div>
        </div>
      );
    }
    return <PortalDataTableEmpty icon="default" message={emptyMessage} />;
  }

  const sourceBadge = (row: CombinedDocRow) =>
    row.source === "own" ? <Badge tone="neutral">You</Badge> : <Badge tone="info">Shared</Badge>;

  // Own-upload preview vars (only meaningful when an own row is open).
  const ownMime = selected?.source === "own" ? uploadedMimeType(selected.upload) : "";
  const ownIsImage = ownMime.startsWith("image/");
  const ownIsPdf = ownMime === "application/pdf";
  // Plain-text previews are rendered as escaped text (never framed as HTML) —
  // an uploaded file's declared mime type is attacker-controlled, so a
  // "text/html" upload must never reach an iframe `src`/`srcDoc`.
  const ownIsText = ownMime.startsWith("text/");
  const ownText = selected?.source === "own" && ownIsText ? decodeDataUrlText(selected.upload.dataUrl) : null;

  // Shared-doc preview vars.
  const sharedMime = selected?.source === "shared" ? selected.doc.mimeType : "";
  const sharedIsImage = sharedMime.startsWith("image/");
  const sharedIsPdf = sharedMime === "application/pdf";

  // Inline detail for the OPEN row — own upload (bytes inline) or shared doc
  // (signed URL). Rendered directly beneath its row/card, never below the table.
  const detailNode: ReactNode =
    selected == null ? null : selected.source === "own" ? (
      <DocumentInlineViewer
        embedded
        title={selected.name}
        src={ownIsPdf ? selected.upload.dataUrl : null}
        onDownload={() => triggerDocumentDownload(selected.upload.dataUrl, selected.name)}
        extraActions={
          <Button
            type="button"
            variant="outline"
            className="rounded-full text-danger"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedId(null);
              onRemove(selected.upload.id);
            }}
          >
            Remove
          </Button>
        }
      >
        {ownIsImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={selected.upload.dataUrl}
            alt={selected.name}
            className="max-h-[720px] w-full bg-white object-contain"
          />
        ) : ownIsText ? (
          <pre className="max-h-[720px] overflow-auto whitespace-pre-wrap break-words bg-white p-4 text-sm text-foreground">
            {ownText ?? "Preview isn't available for this file — use Download to open it."}
          </pre>
        ) : ownIsPdf ? null : (
          <div className="flex h-64 items-center justify-center px-4 text-center text-sm text-neutral-500">
            Preview isn&apos;t available for this file type — use Download to open it.
          </div>
        )}
      </DocumentInlineViewer>
    ) : (
      <DocumentInlineViewer
        embedded
        title={selected.name}
        src={!sharedUrlLoading && sharedIsPdf ? sharedUrl : null}
        downloadAttr="resident-shared-document-download"
        onDownload={() =>
          triggerDocumentDownload(`${SHARED_DOCUMENTS_SIGNED_URL_BASE}/${selected.doc.id}/signed-url?download=1`)
        }
      >
        {sharedUrlLoading ? (
          <div className="flex h-64 items-center justify-center px-4 text-center text-sm text-neutral-500">
            Loading preview…
          </div>
        ) : sharedIsImage && sharedUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={sharedUrl} alt={selected.name} className="max-h-[720px] w-full bg-white object-contain" />
        ) : sharedIsPdf ? null : (
          <div className="flex h-64 items-center justify-center px-4 text-center text-sm text-neutral-500">
            Preview isn&apos;t available for this file type — use Download to open it.
          </div>
        )}
      </DocumentInlineViewer>
    );

  return (
    <>
      <div className="space-y-2 lg:hidden">
        {rows.map((row) => (
          <Fragment key={row.id}>
            <PortalMobileSummaryCard
              title={row.name}
              subtitle={`${row.source === "own" ? "You" : "Shared"} · ${row.kind} · ${safeFormatDateTime(row.dateIso)}`}
              expanded={selectedId === row.id}
              onClick={() => toggleRow(row.id)}
            />
            {selectedId === row.id ? detailNode : null}
          </Fragment>
        ))}
      </div>
      <div className={`${PORTAL_DATA_TABLE_WRAP} hidden lg:block`}>
        <div className={PORTAL_DATA_TABLE_SCROLL}>
          <table className={PORTAL_DATA_TABLE}>
            <thead>
              <tr className={PORTAL_TABLE_HEAD_ROW}>
                <th className={`${MANAGER_TABLE_TH} text-left`}>Name</th>
                <th className={`${MANAGER_TABLE_TH} text-left`}>Source</th>
                <th className={`${MANAGER_TABLE_TH} text-left`}>Type</th>
                <th className={`${MANAGER_TABLE_TH} text-left`}>Date added</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Fragment key={row.id}>
                  <tr
                    className={PORTAL_TABLE_TR_EXPANDABLE}
                    aria-expanded={selectedId === row.id}
                    onClick={() => toggleRow(row.id)}
                  >
                    <td className={`${PORTAL_TABLE_TD} align-middle`}>
                      <PortalTableInlineExpand expanded={selectedId === row.id} className="min-w-0 truncate font-medium text-foreground">
                        <span title={row.name}>{row.name}</span>
                      </PortalTableInlineExpand>
                    </td>
                    <td className={`${PORTAL_TABLE_TD} align-middle`}>{sourceBadge(row)}</td>
                    <td className={`${PORTAL_TABLE_TD} align-middle`}>{row.kind}</td>
                    <td className={`${PORTAL_TABLE_TD} align-middle`}>{safeFormatDateTime(row.dateIso)}</td>
                  </tr>
                  {selectedId === row.id ? (
                    <tr className={PORTAL_TABLE_DETAIL_ROW}>
                      <td colSpan={4} className={PORTAL_TABLE_DETAIL_CELL}>
                        {detailNode}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
