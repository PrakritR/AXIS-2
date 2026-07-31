/** Private bucket for bug/feedback screenshot attachments. */
export const BUG_FEEDBACK_ATTACHMENTS_BUCKET = "bug-feedback-attachments";

const PATH_PREFIX = "bug-feedback/";

export function bugFeedbackAttachmentStoragePrefix(userId: string): string {
  return `${PATH_PREFIX}${userId}/`;
}

export function isBugFeedbackAttachmentPath(path: string, userId?: string): boolean {
  const trimmed = path.trim();
  if (!trimmed.startsWith(PATH_PREFIX) || trimmed.includes("..")) return false;
  if (!userId) return true;
  return trimmed.startsWith(bugFeedbackAttachmentStoragePrefix(userId));
}

/** App-relative URL that streams the object after an auth check (never a public storage URL). */
export function bugFeedbackAttachmentServeUrl(storagePath: string): string {
  return `/api/bug-feedback-attachments?path=${encodeURIComponent(storagePath.trim())}`;
}

export function contentTypeForBugFeedbackPath(storagePath: string): string {
  const ext = storagePath.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/jpeg";
}
