/**
 * Resend inbound webhooks are signed with Svix (the same scheme Resend uses for
 * every webhook). We verify manually with node crypto rather than pulling in the
 * `svix` SDK — mirroring how the Twilio webhook verifies inline.
 *
 * Svix signing (https://docs.svix.com/receiving/verifying-payloads/how-manual):
 *   signed content = `${svix-id}.${svix-timestamp}.${rawBody}`
 *   key            = base64-decode(secret without the `whsec_` prefix)
 *   signature      = base64( HMAC-SHA256(key, signed content) )
 * The `svix-signature` header is a space-separated list of `v1,<base64sig>`
 * entries (a secret may be rotated, so more than one can be valid); a match
 * against ANY entry passes. The timestamp is checked against a tolerance window
 * to blunt replay of a captured-but-valid payload.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export type SvixHeaders = {
  id: string | null | undefined;
  timestamp: string | null | undefined;
  signature: string | null | undefined;
};

/** Reject payloads whose timestamp is more than this far from now (seconds). */
export const SVIX_TIMESTAMP_TOLERANCE_SECONDS = 5 * 60;

function decodeSvixSecret(secret: string): Buffer | null {
  const trimmed = secret.trim();
  if (!trimmed) return null;
  const b64 = trimmed.startsWith("whsec_") ? trimmed.slice("whsec_".length) : trimmed;
  try {
    const buf = Buffer.from(b64, "base64");
    return buf.length > 0 ? buf : null;
  } catch {
    return null;
  }
}

/** Constant-time compare of two base64-encoded signatures. */
function safeSignatureEqual(a: string, expected: string): boolean {
  let bufA: Buffer;
  let bufB: Buffer;
  try {
    bufA = Buffer.from(a, "base64");
    bufB = Buffer.from(expected, "base64");
  } catch {
    return false;
  }
  if (bufA.length === 0 || bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function verifyResendWebhookSignature(opts: {
  rawBody: string;
  headers: SvixHeaders;
  secret: string;
  /** Injectable for tests; defaults to wall-clock seconds. */
  nowSeconds?: number;
}): boolean {
  const { rawBody, headers, secret } = opts;
  if (!secret || !headers.id || !headers.timestamp || !headers.signature) return false;

  const timestamp = Number(headers.timestamp);
  if (!Number.isFinite(timestamp)) return false;
  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > SVIX_TIMESTAMP_TOLERANCE_SECONDS) return false;

  const key = decodeSvixSecret(secret);
  if (!key) return false;

  const signedContent = `${headers.id}.${headers.timestamp}.${rawBody}`;
  const expected = createHmac("sha256", key).update(signedContent, "utf8").digest("base64");

  for (const entry of headers.signature.split(" ")) {
    if (!entry) continue;
    const comma = entry.indexOf(",");
    const sig = comma === -1 ? entry : entry.slice(comma + 1);
    if (safeSignatureEqual(sig, expected)) return true;
  }
  return false;
}
