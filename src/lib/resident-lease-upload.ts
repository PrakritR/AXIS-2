/**
 * Demo: resident-uploaded lease PDF (data URL) scoped by email in localStorage.
 */

const KEY_PREFIX = "axis:resident:uploaded-lease:v1:";

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export type UploadedOwnLease = {
  dataUrl: string;
  fileName: string;
  uploadedAt: string;
};

function keyForEmail(email: string) {
  return `${KEY_PREFIX}${email.trim().toLowerCase()}`;
}

export function readUploadedOwnLease(email: string): UploadedOwnLease | null {
  if (!canUseStorage() || !email.trim()) return null;
  try {
    const raw = window.localStorage.getItem(keyForEmail(email));
    if (!raw) return null;
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== "object") return null;
    const o = v as Record<string, unknown>;
    if (typeof o.dataUrl !== "string" || typeof o.fileName !== "string") return null;
    return {
      dataUrl: o.dataUrl,
      fileName: o.fileName,
      uploadedAt: typeof o.uploadedAt === "string" ? o.uploadedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function saveUploadedOwnLease(email: string, payload: UploadedOwnLease): void {
  if (!canUseStorage() || !email.trim()) return;
  try {
    window.localStorage.setItem(keyForEmail(email), JSON.stringify(payload));
  } catch {
    /* quota or private mode */
  }
}

export function clearUploadedOwnLease(email: string): void {
  if (!canUseStorage() || !email.trim()) return;
  try {
    window.localStorage.removeItem(keyForEmail(email));
  } catch {
    /* ignore */
  }
}
