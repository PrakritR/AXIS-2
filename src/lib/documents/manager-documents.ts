// Shared types and helpers for the manager document library (Documents module
// Phase 1). Server routes and client UI both import from here so the category
// list, MIME allowlist, size cap, and storage-path convention have a single
// source of truth.

export const MANAGER_DOCUMENTS_BUCKET = "manager-documents";

// 25 MB — matches the storage bucket's file_size_limit in the migration.
export const MAX_DOCUMENT_BYTES = 26_214_400;

export const DOCUMENT_CATEGORIES = [
  "lease",
  "insurance",
  "tax",
  "notice",
  "invoice",
  "inspection",
  "photo",
  "other",
] as const;

export type ManagerDocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export const DOCUMENT_CATEGORY_LABELS: Record<ManagerDocumentCategory, string> = {
  lease: "Lease",
  insurance: "Insurance",
  tax: "Tax",
  notice: "Notice",
  invoice: "Invoice",
  inspection: "Inspection",
  photo: "Photo",
  other: "Other",
};

export function isDocumentCategory(value: unknown): value is ManagerDocumentCategory {
  return typeof value === "string" && (DOCUMENT_CATEGORIES as readonly string[]).includes(value);
}

// Allowlist of accepted content types → canonical file extension. Enforced at
// the upload API and mirrored by the bucket's allowed_mime_types.
export const DOCUMENT_MIME_EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/msword": "doc",
  "application/vnd.ms-excel": "xls",
};

// The `accept` attribute for the upload file input (web + native WebView).
export const DOCUMENT_UPLOAD_ACCEPT = Object.keys(DOCUMENT_MIME_EXTENSIONS).join(",");

export function isAllowedDocumentMime(mime: string): boolean {
  return Object.prototype.hasOwnProperty.call(DOCUMENT_MIME_EXTENSIONS, mime);
}

export function extensionForMime(mime: string, fallbackFromName?: string): string {
  if (DOCUMENT_MIME_EXTENSIONS[mime]) return DOCUMENT_MIME_EXTENSIONS[mime];
  const fromName = fallbackFromName?.split(".").pop();
  if (fromName && fromName.length <= 5 && /^[a-z0-9]+$/i.test(fromName)) return fromName.toLowerCase();
  return "bin";
}

// Trim, collapse whitespace, and cap length so a display name is always sane.
export function sanitizeDisplayName(raw: string | undefined | null, fallback = "Untitled document"): string {
  const cleaned = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!cleaned) return fallback;
  return cleaned.slice(0, 200);
}

// Storage paths are namespaced `manager/<manager_user_id>/...` so the
// defense-in-depth storage RLS policy can scope by folder. `rand` is injected
// by the caller (routes) to keep this helper pure/testable.
export function buildDocumentStoragePath(managerUserId: string, ext: string, unique: string): string {
  const safeExt = (ext || "bin").replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin";
  return `manager/${managerUserId}/${unique}.${safeExt}`;
}

// Polymorphic scope columns — all optional; none set = manager-level document.
export type ManagerDocumentScope = {
  propertyId?: string | null;
  unitLabel?: string | null;
  leaseId?: string | null;
  residentUserId?: string | null;
  residentEmail?: string | null;
  vendorId?: string | null;
  workOrderId?: string | null;
};

// Raw DB row shape (snake_case) as returned by Supabase.
export type ManagerDocumentRow = {
  id: string;
  manager_user_id: string;
  display_name: string;
  original_filename: string | null;
  mime_type: string;
  size_bytes: number;
  checksum: string | null;
  storage_path: string;
  category: string;
  property_id: string | null;
  unit_label: string | null;
  lease_id: string | null;
  resident_user_id: string | null;
  resident_email: string | null;
  vendor_id: string | null;
  work_order_id: string | null;
  visibility: string;
  expires_at: string | null;
  superseded_by_document_id: string | null;
  uploaded_by: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

// Client-facing DTO (camelCase). Deliberately omits storage_path — clients
// reference a document by id and fetch a short-lived signed URL on demand.
export type ManagerDocumentDTO = {
  id: string;
  displayName: string;
  originalFilename: string | null;
  mimeType: string;
  sizeBytes: number;
  category: ManagerDocumentCategory;
  scope: ManagerDocumentScope;
  scopeKind: DocumentScopeKind;
  visibility: string;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DocumentScopeKind = "manager" | "property" | "unit" | "lease" | "resident" | "vendor" | "work_order";

export function documentScopeKind(row: Pick<
  ManagerDocumentRow,
  "property_id" | "unit_label" | "lease_id" | "resident_user_id" | "vendor_id" | "work_order_id"
>): DocumentScopeKind {
  if (row.work_order_id) return "work_order";
  if (row.vendor_id) return "vendor";
  if (row.resident_user_id) return "resident";
  if (row.lease_id) return "lease";
  if (row.unit_label) return "unit";
  if (row.property_id) return "property";
  return "manager";
}

export function mapDocumentRow(row: ManagerDocumentRow): ManagerDocumentDTO {
  return {
    id: row.id,
    displayName: row.display_name,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes) || 0,
    category: isDocumentCategory(row.category) ? row.category : "other",
    scope: {
      propertyId: row.property_id,
      unitLabel: row.unit_label,
      leaseId: row.lease_id,
      residentUserId: row.resident_user_id,
      residentEmail: row.resident_email,
      vendorId: row.vendor_id,
      workOrderId: row.work_order_id,
    },
    scopeKind: documentScopeKind(row),
    visibility: row.visibility,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const DOCUMENT_SELECT_COLUMNS =
  "id, manager_user_id, display_name, original_filename, mime_type, size_bytes, checksum, storage_path, category, property_id, unit_label, lease_id, resident_user_id, resident_email, vendor_id, work_order_id, visibility, expires_at, superseded_by_document_id, uploaded_by, deleted_at, created_at, updated_at";
