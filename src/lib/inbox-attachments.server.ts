/** Private bucket for portal Communication message attachments. */
export const INBOX_ATTACHMENTS_BUCKET = "portal-inbox-attachments";

const ALLOWED_EXT = new Set(["jpg", "jpeg", "png", "webp", "gif"]);

export function inboxAttachmentStoragePrefix(userId: string): string {
  return `${userId.trim()}/`;
}

export function isInboxAttachmentPath(path: string): boolean {
  const trimmed = path.trim();
  if (!trimmed || trimmed.includes("..")) return false;
  const parts = trimmed.split("/");
  if (parts.length < 2) return false;
  const ext = (parts[parts.length - 1]?.split(".").pop() ?? "").toLowerCase();
  return ALLOWED_EXT.has(ext);
}

export function inboxAttachmentServeUrl(storagePath: string): string {
  return `/api/portal/inbox-attachments?path=${encodeURIComponent(storagePath.trim())}`;
}

export function contentTypeForInboxAttachmentPath(path: string): string {
  const ext = (path.split(".").pop() ?? "").toLowerCase();
  switch (ext) {
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    default:
      return "image/jpeg";
  }
}
