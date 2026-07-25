/**
 * Manager-uploaded promotion files (image or PDF) — separate from AI-generated flyers.
 */

import { fileToFlyerImage } from "@/lib/promotion-image-upload";

export const PROMOTION_UPLOAD_MAX_BYTES = 12 * 1024 * 1024;

export type PromotionUploadKind = "image" | "pdf";

export type PromotionUploadEntry = {
  id: string;
  title: string;
  kind: PromotionUploadKind;
  /** data: URL or remote URL once persisted */
  fileUrl: string;
  fileName: string;
  mimeType: string;
  createdAt: string;
  updatedAt: string;
};

export function makePromotionUploadId(): string {
  return `promo-upload-${crypto.randomUUID()}`;
}

export function defaultPromotionUploadTitle(sequence: number): string {
  return `Upload ${sequence}`;
}

export function promotionUploadDisplayTitle(entry: Pick<PromotionUploadEntry, "title">, index: number): string {
  const trimmed = entry.title?.trim();
  return trimmed || defaultPromotionUploadTitle(index + 1);
}

function isPromotionUploadEntry(raw: unknown): raw is PromotionUploadEntry {
  if (!raw || typeof raw !== "object") return false;
  const row = raw as PromotionUploadEntry;
  return Boolean(row.id && row.fileUrl && row.kind);
}

export function readPromotionUploadEntries(row: { uploadCopies?: unknown }): PromotionUploadEntry[] {
  if (!Array.isArray(row.uploadCopies)) return [];
  return row.uploadCopies.filter(isPromotionUploadEntry);
}

export async function fileToPromotionUpload(
  file: File,
): Promise<{ kind: PromotionUploadKind; fileUrl: string; mimeType: string } | null> {
  if (file.size > PROMOTION_UPLOAD_MAX_BYTES) return null;

  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (isPdf) {
    const dataUrl = await readFileAsDataUrl(file);
    return dataUrl ? { kind: "pdf", fileUrl: dataUrl, mimeType: "application/pdf" } : null;
  }

  if (file.type.startsWith("image/")) {
    const imageUrl = await fileToFlyerImage(file);
    return imageUrl ? { kind: "image", fileUrl: imageUrl, mimeType: "image/jpeg" } : null;
  }

  return null;
}

function readFileAsDataUrl(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(typeof reader.result === "string" ? reader.result : null);
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}
