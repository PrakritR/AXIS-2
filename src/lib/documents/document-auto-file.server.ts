import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MANAGER_DOCUMENTS_BUCKET,
  buildDocumentStoragePath,
  extensionForMime,
  type ManagerDocumentCategory,
} from "@/lib/documents/manager-documents";
import { defaultExpiryIsoForCategory } from "@/lib/documents/document-expiration";

export type DocumentAutoFileCategory = "lease" | "invoice" | "application" | "expense_receipt";

export type DocumentAutoFileSettings = Partial<Record<DocumentAutoFileCategory, boolean>>;

export const DEFAULT_DOCUMENT_AUTO_FILE: DocumentAutoFileSettings = {
  lease: false,
  invoice: false,
  application: false,
  expense_receipt: false,
};

export async function loadDocumentAutoFileSettings(
  db: SupabaseClient,
  managerUserId: string,
): Promise<DocumentAutoFileSettings> {
  const { data, error } = await db
    .from("manager_automation_settings")
    .select("document_auto_file")
    .eq("manager_user_id", managerUserId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const raw = (data?.document_auto_file ?? {}) as DocumentAutoFileSettings;
  return { ...DEFAULT_DOCUMENT_AUTO_FILE, ...raw };
}

export type AutoFileInput = {
  managerUserId: string;
  uploadedBy?: string | null;
  category: ManagerDocumentCategory;
  displayName: string;
  bytes: Buffer;
  mimeType: string;
  propertyId?: string | null;
  leaseId?: string | null;
  residentUserId?: string | null;
  residentEmail?: string | null;
  vendorId?: string | null;
  workOrderId?: string | null;
  autoFileKind: DocumentAutoFileCategory;
};

/** Server-side library upload (service role). Respects per-category auto-file opt-in. */
export async function autoFileDocumentToLibrary(
  db: SupabaseClient,
  input: AutoFileInput,
): Promise<string | null> {
  const settings = await loadDocumentAutoFileSettings(db, input.managerUserId);
  if (!settings[input.autoFileKind]) return null;

  const ext = extensionForMime(input.mimeType);
  if (!ext) return null;

  const objectId = randomUUID();
  const storagePath = buildDocumentStoragePath(input.managerUserId, ext, objectId);
  const checksum = createHash("sha256").update(input.bytes).digest("hex");

  const { error: uploadError } = await db.storage
    .from(MANAGER_DOCUMENTS_BUCKET)
    .upload(storagePath, input.bytes, { contentType: input.mimeType, upsert: false });
  if (uploadError) throw new Error(uploadError.message);

  const now = new Date().toISOString();
  const expiresAt = defaultExpiryIsoForCategory(input.category);

  const { data, error } = await db
    .from("manager_documents")
    .insert({
      manager_user_id: input.managerUserId,
      display_name: input.displayName,
      original_filename: `${input.displayName}.${ext}`,
      mime_type: input.mimeType,
      size_bytes: input.bytes.length,
      checksum,
      storage_path: storagePath,
      category: input.category,
      property_id: input.propertyId ?? null,
      lease_id: input.leaseId ?? null,
      resident_user_id: input.residentUserId ?? null,
      resident_email: input.residentEmail?.trim().toLowerCase() ?? null,
      vendor_id: input.vendorId ?? null,
      work_order_id: input.workOrderId ?? null,
      visibility: "manager",
      expires_at: expiresAt,
      uploaded_by: input.uploadedBy ?? input.managerUserId,
      updated_at: now,
    })
    .select("id")
    .single();

  if (error) {
    await db.storage.from(MANAGER_DOCUMENTS_BUCKET).remove([storagePath]);
    throw new Error(error.message);
  }

  return data?.id ? String(data.id) : null;
}
