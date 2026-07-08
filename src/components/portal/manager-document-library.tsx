"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useAppUi } from "@/components/providers/app-ui-provider";
import {
  ManagerPortalFilterRow,
  MANAGER_TABLE_TH,
} from "@/components/portal/portal-metrics";
import {
  PORTAL_DATA_TABLE,
  PORTAL_DATA_TABLE_SCROLL,
  PORTAL_DATA_TABLE_WRAP,
  PORTAL_DETAIL_BTN,
  PORTAL_MOBILE_CARD_CLASS,
  PORTAL_TABLE_DETAIL_CELL,
  PORTAL_TABLE_DETAIL_ROW,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_TD,
  PORTAL_TABLE_TR_EXPANDABLE,
  PortalDataTableEmpty,
  PortalTableDetailActions,
  PortalTableInlineExpand,
  createPortalRowExpandClick,
} from "@/components/portal/portal-data-table";
import { buildManagerPropertyFilterOptions } from "@/lib/manager-portfolio-access";
import { isDemoModeActive } from "@/lib/demo/demo-session";
import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_CATEGORY_LABELS,
  DOCUMENT_UPLOAD_ACCEPT,
  MAX_DOCUMENT_BYTES,
  type ManagerDocumentCategory,
  type ManagerDocumentDTO,
} from "@/lib/documents/manager-documents";

const SCOPE_FILTERS: { id: string; label: string }[] = [
  { id: "", label: "All scopes" },
  { id: "manager", label: "Manager-level" },
  { id: "property", label: "Property" },
  { id: "lease", label: "Lease" },
  { id: "resident", label: "Resident" },
  { id: "vendor", label: "Vendor" },
  { id: "work_order", label: "Work order" },
];

const SCOPE_LABELS: Record<ManagerDocumentDTO["scopeKind"], string> = {
  manager: "Manager-level",
  property: "Property",
  unit: "Unit",
  lease: "Lease",
  resident: "Resident",
  vendor: "Vendor",
  work_order: "Work order",
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function isImageMime(mime: string): boolean {
  return mime.startsWith("image/");
}

export function ManagerDocumentLibrary({ userId }: { userId: string | null }) {
  const { showToast } = useAppUi();
  const demo = isDemoModeActive();

  const [documents, setDocuments] = useState<ManagerDocumentDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [scopeFilter, setScopeFilter] = useState<string>("");
  const [propertyFilter, setPropertyFilter] = useState<string>("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<ManagerDocumentDTO | null>(null);
  const [previewTarget, setPreviewTarget] = useState<ManagerDocumentDTO | null>(null);

  const propertyOptions = useMemo(() => buildManagerPropertyFilterOptions(userId), [userId]);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (demo) {
        setDocuments([]);
        return;
      }
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (categoryFilter) params.set("category", categoryFilter);
        if (scopeFilter) params.set("scope", scopeFilter);
        if (propertyFilter) params.set("propertyId", propertyFilter);
        if (search.trim()) params.set("q", search.trim());
        const res = await fetch(`/api/manager-documents?${params}`, { credentials: "include", signal });
        const data = await res.json();
        if (signal?.aborted) return;
        if (!res.ok) throw new Error(data.error ?? "Failed to load documents.");
        setDocuments((data.documents as ManagerDocumentDTO[]) ?? []);
      } catch (e) {
        if (signal?.aborted) return;
        showToast(e instanceof Error ? e.message : "Failed to load documents.");
      } finally {
        setLoading(false);
      }
    },
    [demo, categoryFilter, scopeFilter, propertyFilter, search, showToast],
  );

  // Debounce so typing in search doesn't fire a request per keystroke; abort
  // superseded requests so a slow stale response can't overwrite fresh results.
  useEffect(() => {
    const controller = new AbortController();
    const t = setTimeout(() => void load(controller.signal), 250);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [load]);

  const handleDelete = useCallback(
    async (doc: ManagerDocumentDTO) => {
      if (!window.confirm(`Delete "${doc.displayName}"? It will be removed from your library.`)) return;
      try {
        const res = await fetch(`/api/manager-documents/${doc.id}`, { method: "DELETE", credentials: "include" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Failed to delete document.");
        setDocuments((cur) => cur.filter((d) => d.id !== doc.id));
        showToast("Document deleted.");
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Failed to delete document.");
      }
    },
    [showToast],
  );

  const propertyLabel = useCallback(
    (id: string | null | undefined) => propertyOptions.find((p) => p.id === id)?.label ?? id ?? "",
    [propertyOptions],
  );

  const scopeSummary = useCallback(
    (doc: ManagerDocumentDTO): string => {
      switch (doc.scopeKind) {
        case "property":
          return `${SCOPE_LABELS.property} · ${propertyLabel(doc.scope.propertyId)}`;
        case "resident":
          return `${SCOPE_LABELS.resident}${doc.scope.residentEmail ? ` · ${doc.scope.residentEmail}` : ""}`;
        case "vendor":
          return `${SCOPE_LABELS.vendor}`;
        case "work_order":
          return `${SCOPE_LABELS.work_order}`;
        case "lease":
          return `${SCOPE_LABELS.lease}`;
        case "unit":
          return `${SCOPE_LABELS.unit} · ${doc.scope.unitLabel ?? ""}`;
        default:
          return SCOPE_LABELS.manager;
      }
    },
    [propertyLabel],
  );

  const renderActions = (doc: ManagerDocumentDTO) => (
    <PortalTableDetailActions placement="top">
      <Button
        type="button"
        variant="outline"
        className={PORTAL_DETAIL_BTN}
        onClick={() => setPreviewTarget(doc)}
        data-attr="document-preview"
      >
        Preview
      </Button>
      <Button
        type="button"
        variant="outline"
        className={PORTAL_DETAIL_BTN}
        onClick={() => setRenameTarget(doc)}
        data-attr="document-rename"
      >
        Rename
      </Button>
      <Button
        type="button"
        variant="danger"
        className={PORTAL_DETAIL_BTN}
        onClick={() => void handleDelete(doc)}
        data-attr="document-delete"
      >
        Delete
      </Button>
    </PortalTableDetailActions>
  );

  const renderDetail = (doc: ManagerDocumentDTO) => (
    <>
      {renderActions(doc)}
      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-xs text-muted sm:grid-cols-2">
        <div className="flex gap-2">
          <dt className="font-medium text-foreground/70">Type</dt>
          <dd className="truncate">{doc.mimeType}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-medium text-foreground/70">Size</dt>
          <dd>{formatBytes(doc.sizeBytes)}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-medium text-foreground/70">Scope</dt>
          <dd className="truncate">{scopeSummary(doc)}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-medium text-foreground/70">Uploaded</dt>
          <dd>{formatDate(doc.createdAt)}</dd>
        </div>
      </dl>
    </>
  );

  const empty = !loading && documents.length === 0;

  return (
    <div className="space-y-4">
      <ManagerPortalFilterRow>
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name…"
          className="h-10 max-w-[16rem]"
          aria-label="Search documents"
          data-attr="document-search"
        />
        <Select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="h-10 max-w-[12rem]"
          aria-label="Filter by category"
        >
          <option value="">All categories</option>
          {DOCUMENT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {DOCUMENT_CATEGORY_LABELS[c]}
            </option>
          ))}
        </Select>
        <Select
          value={scopeFilter}
          onChange={(e) => setScopeFilter(e.target.value)}
          className="h-10 max-w-[12rem]"
          aria-label="Filter by scope"
        >
          {SCOPE_FILTERS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </Select>
        {propertyOptions.length > 0 ? (
          <Select
            value={propertyFilter}
            onChange={(e) => setPropertyFilter(e.target.value)}
            className="h-10 max-w-[14rem]"
            aria-label="Filter by property"
          >
            <option value="">All properties</option>
            {propertyOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Select>
        ) : null}
        <Button
          type="button"
          variant="primary"
          className="ml-auto h-10 shrink-0"
          onClick={() => setUploadOpen(true)}
          disabled={demo}
          data-attr="document-upload-open"
        >
          Upload
        </Button>
      </ManagerPortalFilterRow>

      {demo ? (
        <PortalDataTableEmpty
          message="The document library needs a signed-in manager account. Sign in to upload and manage files."
          icon="document"
        />
      ) : empty ? (
        <PortalDataTableEmpty message="No documents yet. Upload a file to start your library." icon="document" />
      ) : (
        <>
          {/* Mobile cards */}
          <div className="space-y-2 lg:hidden">
            {documents.map((doc) => {
              const expanded = expandedId === doc.id;
              return (
                <div key={doc.id} className={PORTAL_MOBILE_CARD_CLASS}>
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => setExpandedId((cur) => (cur === doc.id ? null : doc.id))}
                    aria-expanded={expanded}
                  >
                    <div className="flex min-w-0 items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <PortalTableInlineExpand expanded={expanded} className="font-semibold text-foreground">
                          <span className="truncate">{doc.displayName}</span>
                        </PortalTableInlineExpand>
                        <p className="mt-0.5 truncate text-xs text-muted">
                          {scopeSummary(doc)} · {formatBytes(doc.sizeBytes)}
                        </p>
                      </div>
                      <Badge tone="neutral">{DOCUMENT_CATEGORY_LABELS[doc.category]}</Badge>
                    </div>
                  </button>
                  {expanded ? <div className="mt-3 border-t border-border pt-3">{renderDetail(doc)}</div> : null}
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className={`${PORTAL_DATA_TABLE_WRAP} hidden lg:block`}>
            <div className={PORTAL_DATA_TABLE_SCROLL}>
              <table className={PORTAL_DATA_TABLE}>
                <thead>
                  <tr className={PORTAL_TABLE_HEAD_ROW}>
                    <th className={`${MANAGER_TABLE_TH} text-left`}>Name</th>
                    <th className={`${MANAGER_TABLE_TH} text-left`}>Category</th>
                    <th className={`${MANAGER_TABLE_TH} text-left`}>Scope</th>
                    <th className={`${MANAGER_TABLE_TH} text-left`}>Size</th>
                    <th className={`${MANAGER_TABLE_TH} text-left`}>Uploaded</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((doc) => (
                    <Fragment key={doc.id}>
                      <tr
                        className={PORTAL_TABLE_TR_EXPANDABLE}
                        onClick={createPortalRowExpandClick(() =>
                          setExpandedId((cur) => (cur === doc.id ? null : doc.id)),
                        )}
                        aria-expanded={expandedId === doc.id}
                      >
                        <td className={`${PORTAL_TABLE_TD} font-medium text-foreground`}>
                          <PortalTableInlineExpand expanded={expandedId === doc.id}>
                            <span className="truncate">{doc.displayName}</span>
                          </PortalTableInlineExpand>
                        </td>
                        <td className={PORTAL_TABLE_TD}>
                          <Badge tone="neutral">{DOCUMENT_CATEGORY_LABELS[doc.category]}</Badge>
                        </td>
                        <td className={`${PORTAL_TABLE_TD} truncate`}>{scopeSummary(doc)}</td>
                        <td className={`${PORTAL_TABLE_TD} tabular-nums`}>{formatBytes(doc.sizeBytes)}</td>
                        <td className={`${PORTAL_TABLE_TD} tabular-nums`}>{formatDate(doc.createdAt)}</td>
                      </tr>
                      {expandedId === doc.id ? (
                        <tr className={PORTAL_TABLE_DETAIL_ROW}>
                          <td colSpan={5} className={PORTAL_TABLE_DETAIL_CELL}>
                            {renderDetail(doc)}
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
      )}

      <UploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        propertyOptions={propertyOptions}
        onUploaded={(doc) => {
          setDocuments((cur) => [doc, ...cur]);
          setUploadOpen(false);
        }}
      />

      <RenameModal
        doc={renameTarget}
        onClose={() => setRenameTarget(null)}
        onRenamed={(updated) => {
          setDocuments((cur) => cur.map((d) => (d.id === updated.id ? updated : d)));
          setRenameTarget(null);
        }}
      />

      <PreviewModal doc={previewTarget} onClose={() => setPreviewTarget(null)} />
    </div>
  );
}

function UploadModal({
  open,
  onClose,
  propertyOptions,
  onUploaded,
}: {
  open: boolean;
  onClose: () => void;
  propertyOptions: { id: string; label: string }[];
  onUploaded: (doc: ManagerDocumentDTO) => void;
}) {
  const { showToast } = useAppUi();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [category, setCategory] = useState<ManagerDocumentCategory>("other");
  const [propertyId, setPropertyId] = useState("");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setFile(null);
      setDisplayName("");
      setCategory("other");
      setPropertyId("");
      setDragging(false);
      setBusy(false);
    }
  }, [open]);

  const pickFile = useCallback((f: File | null | undefined) => {
    if (!f) return;
    if (f.size > MAX_DOCUMENT_BYTES) {
      showToast("File exceeds the 25 MB limit.");
      return;
    }
    setFile(f);
    setDisplayName((cur) => cur || f.name.replace(/\.[^.]+$/, ""));
  }, [showToast]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    pickFile(e.dataTransfer.files?.[0]);
  };

  const submit = async () => {
    if (!file) {
      showToast("Choose a file to upload.");
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("displayName", displayName.trim() || file.name);
      form.set("category", category);
      if (propertyId) form.set("propertyId", propertyId);
      const res = await fetch("/api/manager-documents", { method: "POST", body: form, credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Upload failed.");
      showToast("Document uploaded.");
      onUploaded(data.document as ManagerDocumentDTO);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Upload document"
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" variant="primary" onClick={() => void submit()} disabled={busy || !file} data-attr="document-upload-submit">
            {busy ? "Uploading…" : "Upload"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`flex w-full flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed px-4 py-8 text-center text-sm transition-colors ${
            dragging ? "border-primary bg-primary/5" : "border-border bg-accent/20 hover:bg-accent/30"
          }`}
        >
          <span className="font-medium text-foreground">
            {file ? file.name : "Drag a file here or tap to choose"}
          </span>
          <span className="text-xs text-muted">
            {file ? formatBytes(file.size) : "PDF, images, or Office files up to 25 MB"}
          </span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={DOCUMENT_UPLOAD_ACCEPT}
          className="sr-only"
          onChange={(e) => pickFile(e.target.files?.[0])}
        />

        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground/70" htmlFor="doc-display-name">
            Name
          </label>
          <Input
            id="doc-display-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Document name"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground/70" htmlFor="doc-category">
              Category
            </label>
            <Select id="doc-category" value={category} onChange={(e) => setCategory(e.target.value as ManagerDocumentCategory)}>
              {DOCUMENT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {DOCUMENT_CATEGORY_LABELS[c]}
                </option>
              ))}
            </Select>
          </div>
          {propertyOptions.length > 0 ? (
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground/70" htmlFor="doc-property">
                Property (optional)
              </label>
              <Select id="doc-property" value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
                <option value="">Manager-level</option>
                {propertyOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}

function RenameModal({
  doc,
  onClose,
  onRenamed,
}: {
  doc: ManagerDocumentDTO | null;
  onClose: () => void;
  onRenamed: (doc: ManagerDocumentDTO) => void;
}) {
  const { showToast } = useAppUi();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(doc?.displayName ?? "");
  }, [doc]);

  const submit = async () => {
    if (!doc) return;
    const trimmed = name.trim();
    if (!trimmed) {
      showToast("Name cannot be empty.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/manager-documents/${doc.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ displayName: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Rename failed.");
      showToast("Document renamed.");
      onRenamed(data.document as ManagerDocumentDTO);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Rename failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={Boolean(doc)}
      onClose={onClose}
      title="Rename document"
      dense
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" variant="primary" onClick={() => void submit()} disabled={busy} data-attr="document-rename-submit">
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      }
    >
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Document name" autoFocus />
    </Modal>
  );
}

function PreviewModal({ doc, onClose }: { doc: ManagerDocumentDTO | null; onClose: () => void }) {
  const { showToast } = useAppUi();
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!doc) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setUrl(null);
    void (async () => {
      try {
        const res = await fetch(`/api/manager-documents/${doc.id}/signed-url`, { credentials: "include" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to open document.");
        if (!cancelled) setUrl(data.url as string);
      } catch (e) {
        if (!cancelled) showToast(e instanceof Error ? e.message : "Failed to open document.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [doc, showToast]);

  const canInline = doc ? doc.mimeType === "application/pdf" || isImageMime(doc.mimeType) : false;

  return (
    <Modal
      open={Boolean(doc)}
      onClose={onClose}
      title={doc?.displayName ?? "Document"}
      panelClassName="max-w-3xl"
      footer={
        doc ? (
          <div className="flex justify-end gap-2">
            <a
              href={`/api/manager-documents/${doc.id}/signed-url?download=1`}
              className={`inline-flex h-10 items-center rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground hover:bg-accent/40 ${PORTAL_DETAIL_BTN}`}
              data-attr="document-download"
            >
              Download
            </a>
          </div>
        ) : null
      }
    >
      <div className="min-h-[50vh]">
        {loading ? (
          <p className="py-12 text-center text-sm text-muted">Loading preview…</p>
        ) : !url ? (
          <p className="py-12 text-center text-sm text-muted">Preview unavailable.</p>
        ) : !canInline ? (
          <p className="py-12 text-center text-sm text-muted">
            This file type can’t be previewed inline. Use Download to open it.
          </p>
        ) : doc && isImageMime(doc.mimeType) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={doc.displayName} className="mx-auto max-h-[70vh] max-w-full rounded-lg" />
        ) : (
          <iframe src={url} title={doc?.displayName ?? "Document"} className="h-[70vh] w-full rounded-lg border border-border" />
        )}
      </div>
    </Modal>
  );
}
