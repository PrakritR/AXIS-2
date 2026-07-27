import type { ApplicationPhotoSlot } from "@/lib/rental-application/types";

/**
 * Client-safe constants + guards shared by the applicant photo-capture UI and
 * the server routes. No Node-only imports here so the wizard can validate a
 * file locally before it ever leaves the browser. The server side (path
 * building, ownership checks, Storage access) lives in
 * `application-photos.server.ts`.
 */

// 15 MB — must match the `application-documents` bucket file_size_limit.
export const MAX_APPLICATION_PHOTO_BYTES = 15_728_640;

/** Accepted MIME types → canonical file extension. */
export const APPLICATION_PHOTO_MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf",
};

const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

export const APPLICATION_PHOTO_SLOTS: readonly ApplicationPhotoSlot[] = ["idFront", "idBack", "income"];

export function isApplicationPhotoSlot(value: unknown): value is ApplicationPhotoSlot {
  return typeof value === "string" && (APPLICATION_PHOTO_SLOTS as readonly string[]).includes(value);
}

export function applicationPhotoExtForMime(mime: string): string | null {
  return APPLICATION_PHOTO_MIME_EXT[mime.trim().toLowerCase()] ?? null;
}

/**
 * MIME types allowed for a given slot. ID photos are images only (a picture of
 * the card); proof of income additionally allows a PDF pay stub / statement.
 */
export function allowedMimeTypesForSlot(slot: ApplicationPhotoSlot): string[] {
  return slot === "income" ? [...IMAGE_MIME_TYPES, "application/pdf"] : [...IMAGE_MIME_TYPES];
}

export function isAllowedApplicationPhotoMime(mime: string, slot: ApplicationPhotoSlot): boolean {
  return allowedMimeTypesForSlot(slot).includes(mime.trim().toLowerCase());
}

/** `accept` attribute for the slot's file inputs. */
export function acceptForSlot(slot: ApplicationPhotoSlot): string {
  return allowedMimeTypesForSlot(slot).join(",");
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

export const MAX_APPLICATION_PHOTO_SIZE_LABEL = "15 MB";
