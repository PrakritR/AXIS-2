/** Scheduled automation message ids contain `|` — encode for URL path segments (Vercel/Next reject raw pipes). */

function base64UrlEncode(text: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(text, "utf8").toString("base64url");
  }
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(segment: string): string | null {
  try {
    if (typeof Buffer !== "undefined") {
      return Buffer.from(segment, "base64url").toString("utf8");
    }
    const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(padded);
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
