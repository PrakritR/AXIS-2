/**
 * Inbound MMS media capture. Twilio media URLs require HTTP Basic auth and are
 * eventually deleted from Twilio, so we copy each attachment into the private
 * `sms-media` bucket. The durable identifier is the bucket PATH — signed URLs
 * expire, so only the path is persisted (DB rows, inbox bodies) and fresh
 * signed URLs are minted at read time via /api/sms-media, the same
 * private-bucket model as manager-documents. The signed URL returned here is
 * for the immediate outbound legs only (SMS relay, email body).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
  "video/3gpp": "3gp",
  "video/mp4": "mp4",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "text/vcard": "vcf",
};

export const SMS_MEDIA_BUCKET = "sms-media";
const OUTBOUND_SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7;
const READ_SIGNED_URL_TTL_SECONDS = 60 * 10;

export type StoredSmsMedia = {
  /** Bucket path — the durable identifier persisted in DB rows / inbox bodies. */
  path: string;
  /** 7-day signed URL for the immediate outbound SMS/email legs only. */
  signedUrl: string;
};

/** Extract MediaUrl0..N from a parsed Twilio webhook payload. */
export function twilioMediaUrls(params: Record<string, string>): string[] {
  const count = Math.min(Number(params.NumMedia ?? 0) || 0, 10);
  const urls: string[] = [];
  for (let i = 0; i < count; i++) {
    const url = String(params[`MediaUrl${i}`] ?? "").trim();
    if (url.startsWith("https://")) urls.push(url);
  }
  return urls;
}

/** In-app link that mints a fresh signed URL at read time (never expires itself). */
export function smsMediaAppUrl(path: string): string {
  return `/api/sms-media?path=${encodeURIComponent(path)}`;
}

/** Short-lived signed URL for read-time access after an ownership check. */
export async function createSmsMediaSignedUrl(
  db: SupabaseClient,
  path: string,
): Promise<string | null> {
  const { data } = await db.storage
    .from(SMS_MEDIA_BUCKET)
    .createSignedUrl(path, READ_SIGNED_URL_TTL_SECONDS);
  return data?.signedUrl ?? null;
}

/**
 * Copy Twilio-hosted MMS attachments into the sms-media bucket under the
 * owning manager's folder. Best-effort per attachment — a failed fetch skips
 * that item rather than dropping the whole message.
 */
export async function storeInboundMedia(
  db: SupabaseClient,
  args: { managerUserId: string; messageSid: string; mediaUrls: string[] },
): Promise<StoredSmsMedia[]> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!accountSid || !authToken || args.mediaUrls.length === 0) return [];
  const basicAuth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  const stored: StoredSmsMedia[] = [];
  for (const [index, url] of args.mediaUrls.entries()) {
    try {
      const res = await fetch(url, { headers: { Authorization: `Basic ${basicAuth}` } });
      if (!res.ok) continue;
      const mime = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
      const ext = EXT_BY_MIME[mime];
      if (!ext) continue; // outside the bucket allowlist
      const bytes = Buffer.from(await res.arrayBuffer());
      if (bytes.byteLength === 0 || bytes.byteLength > 10 * 1024 * 1024) continue;

      const path = `manager/${args.managerUserId}/${args.messageSid}/${index}.${ext}`;
      const { error: uploadError } = await db.storage
        .from(SMS_MEDIA_BUCKET)
        .upload(path, bytes, { contentType: mime, upsert: true });
      if (uploadError) continue;

      const { data: signed } = await db.storage
        .from(SMS_MEDIA_BUCKET)
        .createSignedUrl(path, OUTBOUND_SIGNED_URL_TTL_SECONDS);
      if (signed?.signedUrl) stored.push({ path, signedUrl: signed.signedUrl });
    } catch {
      // best-effort: skip this attachment
    }
  }
  return stored;
}
