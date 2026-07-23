/** Scheduled automation message ids contain `|` — encode for URL path segments (Vercel/Next reject raw pipes). */

// Encode/decode via standard base64 only (never the `base64url` encoding token):
// Next's browser Buffer polyfill throws "Unknown encoding: base64url", and the
// old `typeof Buffer !== "undefined"` guard was TRUE in the browser (webpack
// shims Buffer), so it took the throwing path client-side. btoa/atob and the
// `base64` Buffer encoding are supported in both the browser and Node, so we do
// the URL-safe transform ourselves and depend on neither `base64url` nor a
// runtime check.
function toBase64(binary: string): string {
  if (typeof btoa !== "undefined") return btoa(binary);
  return Buffer.from(binary, "binary").toString("base64");
}

function fromBase64(base64: string): string {
  if (typeof atob !== "undefined") return atob(base64);
  return Buffer.from(base64, "base64").toString("binary");
}

function base64UrlEncode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return toBase64(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(segment: string): string | null {
  try {
    const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const binary = fromBase64(padded);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

export function encodeScheduledMessagePathId(id: string): string {
  if (!id.includes("|")) return encodeURIComponent(id);
  return base64UrlEncode(id);
}

/** Decode a dynamic route segment back to the canonical sched|… message id. */
export function decodeScheduledMessagePathId(rawSegment: string): string {
  const segment = decodeURIComponent(rawSegment);
  if (segment.startsWith("sched")) return segment;
  const fromB64 = base64UrlDecode(segment);
  if (fromB64?.startsWith("sched")) return fromB64;
  return segment;
}
