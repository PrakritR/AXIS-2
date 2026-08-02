import type { SupabaseClient } from "@supabase/supabase-js";

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

export function sanitizeInboxAttachmentExt(ext: unknown, mime: string): string | null {
  const raw = String(ext ?? mime.split("/")[1] ?? "jpg")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (ALLOWED_EXT.has(raw)) return raw;
  if (mime === "image/jpeg") return "jpg";
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
    .ilike("participant_email", email)
    .limit(300);
  return (participant ?? []).some((row) => rowDataReferencesAttachment(row.row_data, path));
}
