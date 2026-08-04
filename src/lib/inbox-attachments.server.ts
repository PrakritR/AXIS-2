import type { SupabaseClient } from "@supabase/supabase-js";

/** Private bucket for portal Communication message attachments. */
export const INBOX_ATTACHMENTS_BUCKET = "portal-inbox-attachments";

const ALLOWED_EXT = new Set(["jpg", "jpeg", "png", "webp", "gif", "pdf"]);

/** Characters kept from the uploader's original file name (extension excluded). */
const MAX_ATTACHMENT_NAME_CHARS = 64;

export function inboxAttachmentStoragePrefix(userId: string): string {
  return `${userId.trim()}/`;
}

/**
 * Turn an uploader-supplied file name into a storage-key-safe final path segment.
 *
 * The original name is the ONLY visible label on a PDF chip, so it has to be
 * STORED — the rest of the key is a timestamp plus a UUID and carries nothing of
 * it. Keeping it inside the object key (rather than in a parallel metadata
 * field) means the label can never drift from the bytes it names, every existing
 * "derive the name from the path" reader becomes correct with no plumbing, and
 * the download's `Content-Disposition` filename is the real one too.
 *
 * Restricted to `[A-Za-z0-9._-]`: Supabase Storage keys accept only a limited
 * character set, and the same restriction makes it impossible for a name to
 * introduce a path separator, a `..` segment, or a quote/newline that could
 * break out of the `Content-Disposition` header.
 */
export function sanitizeInboxAttachmentFileName(raw: unknown, ext: string): string {
  const base = String(raw ?? "").split(/[\\/]/).pop() ?? "";
  const stem = base.replace(/\.[^.]*$/, "");
  const cleaned = stem
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/\.+/g, ".")
    .replace(/-+/g, "-")
    .replace(/^[.\-]+/, "")
    .slice(0, MAX_ATTACHMENT_NAME_CHARS)
    .replace(/[.\-]+$/, "");
  return `${cleaned || "attachment"}.${ext}`;
}

/**
 * Always `attachment`, never `inline`.
 *
 * These bytes are attacker-controllable and this route answers on the app's own
 * origin, so an inline response would be a same-origin document the uploader
 * authored. Deliberately does not branch on content type — the hole opened the
 * first time a non-image type was allow-listed, and a type-blind disposition is
 * what keeps a future `ALLOWED_MIME` edit from reopening it.
 */
export function contentDispositionForInboxAttachmentPath(path: string): string {
  const raw = path.split("/").pop() ?? "";
  const safe = raw.replace(/[^A-Za-z0-9._-]/g, "_") || "attachment";
  return `attachment; filename="${safe}"`;
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
    case "pdf":
      return "application/pdf";
    default:
      return "image/jpeg";
  }
}

export function sanitizeInboxAttachmentExt(ext: unknown, mime: string): string | null {
  const raw = String(ext ?? mime.split("/")[1] ?? "jpg")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (ALLOWED_EXT.has(raw)) return raw;
  if (mime === "image/jpeg") return "jpg";
  if (mime === "application/pdf") return "pdf";
  return null;
}

/** Accept only same-origin inbox-attachment serve URLs owned by the sender. */
export function normalizeInboxAttachmentUrls(raw: unknown[], senderUserId: string): string[] {
  const ownerId = senderUserId.trim();
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const u = String(item ?? "").trim();
    if (!u.startsWith("/api/portal/inbox-attachments?")) continue;
    let path = "";
    try {
      path = new URL(u, "http://localhost").searchParams.get("path")?.trim() ?? "";
    } catch {
      continue;
    }
    if (!path || !isInboxAttachmentPath(path)) continue;
    if ((path.split("/")[0] ?? "") !== ownerId) continue;
    const canonical = inboxAttachmentServeUrl(path);
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    out.push(canonical);
  }
  return out;
}

function rowDataReferencesAttachment(rowData: unknown, path: string): boolean {
  const serveUrl = inboxAttachmentServeUrl(path);
  const encodedPath = encodeURIComponent(path);
  const hay = JSON.stringify(rowData ?? {});
  return hay.includes(path) || hay.includes(serveUrl) || hay.includes(encodedPath);
}

/** Owner, conversation participant (inbox thread row), or admin may read attachment bytes. */
export async function userCanAccessInboxAttachment(
  db: SupabaseClient,
  opts: { userId: string; userEmail: string; path: string; isAdmin: boolean },
): Promise<boolean> {
  const { userId, userEmail, path, isAdmin } = opts;
  const ownerId = path.split("/")[0] ?? "";
  if (ownerId === userId) return true;
  if (isAdmin) return true;

  const email = userEmail.trim().toLowerCase();
  const { data: owned } = await db
    .from("portal_inbox_thread_records")
    .select("row_data")
    .eq("owner_user_id", userId)
    .limit(300);
  if ((owned ?? []).some((row) => rowDataReferencesAttachment(row.row_data, path))) return true;

  if (!email) return false;
  const { data: participant } = await db
    .from("portal_inbox_thread_records")
    .select("row_data")
    .eq("participant_email", email)
    .limit(300);
  return (participant ?? []).some((row) => rowDataReferencesAttachment(row.row_data, path));
}
