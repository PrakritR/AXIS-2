/**
 * Inbound MMS media capture. Twilio media URLs require HTTP Basic auth and are
 * eventually deleted from Twilio, so we copy each attachment into the private
 * `sms-media` bucket and hand out short-lived signed URLs — the same
 * private-bucket model as manager-documents.
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
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7;

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

/**
 * Copy Twilio-hosted MMS attachments into the sms-media bucket under the
 * owning manager's folder. Returns signed URLs (7 days) for immediate display
 * in inbox/email bodies. Best-effort per attachment — a failed fetch skips
 * that item rather than dropping the whole message.
 */
export async function storeInboundMedia(
  db: SupabaseClient,
  args: { managerUserId: string; messageSid: string; mediaUrls: string[] },
): Promise<string[]> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!accountSid || !authToken || args.mediaUrls.length === 0) return [];
  const basicAuth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  const signedUrls: string[] = [];
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
        .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
      if (signed?.signedUrl) signedUrls.push(signed.signedUrl);
    } catch {
      // best-effort: skip this attachment
    }
  }
  return signedUrls;
}
