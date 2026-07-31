/** Private bucket for vendor compliance uploads (insurance, license, W-9). */
export const VENDOR_DOCUMENTS_BUCKET = "vendor-documents";

/** Object path prefix for a vendor's own compliance files. */
export function vendorDocumentStoragePrefix(userId: string): string {
  return `vendor-documents/${userId}/`;
}

export function isVendorDocumentStoragePath(path: string, userId: string): boolean {
  const trimmed = path.trim();
  const prefix = vendorDocumentStoragePrefix(userId);
  return trimmed.startsWith(prefix) && !trimmed.includes("..");
}
