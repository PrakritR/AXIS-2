/**
 * Image attachments for assistant chat. The client downscales and base64s
 * images; this module validates them and builds Anthropic image content
 * blocks. Images ride on the LAST user message only — history stays
 * text-only, which keeps the loop's halt-on-write-proposal safe and bounds
 * request size.
 */
import type Anthropic from "@anthropic-ai/sdk";

const ALLOWED_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
export const MAX_CHAT_IMAGES = 3;
// Vercel's request body cap is 4.5MB; base64 inflates ~4/3, so cap the encoded
// payload total well under it.
export const MAX_TOTAL_IMAGE_BASE64_CHARS = 4 * 1024 * 1024;

export type ChatImageInput = { mediaType: string; dataBase64: string };

export type ParsedChatImages =
  | { ok: true; blocks: Anthropic.ImageBlockParam[] }
  | { ok: false; error: string };

export function parseChatImages(raw: unknown): ParsedChatImages {
  if (raw == null) return { ok: true, blocks: [] };
  if (!Array.isArray(raw)) return { ok: false, error: "images must be an array." };
  if (raw.length === 0) return { ok: true, blocks: [] };
  if (raw.length > MAX_CHAT_IMAGES) {
    return { ok: false, error: `At most ${MAX_CHAT_IMAGES} images per message.` };
  }

  const blocks: Anthropic.ImageBlockParam[] = [];
  let totalChars = 0;
  for (const item of raw as ChatImageInput[]) {
    const mediaType = String(item?.mediaType ?? "").trim().toLowerCase();
    const data = String(item?.dataBase64 ?? "").trim();
    if (!ALLOWED_MEDIA_TYPES.has(mediaType)) {
      return { ok: false, error: "Unsupported image type — use JPEG, PNG, WebP, or GIF." };
    }
    if (!data || !/^[A-Za-z0-9+/=]+$/.test(data)) {
      return { ok: false, error: "Invalid image data." };
    }
    totalChars += data.length;
    if (totalChars > MAX_TOTAL_IMAGE_BASE64_CHARS) {
      return { ok: false, error: "Images are too large — try fewer or smaller photos." };
    }
    blocks.push({
      type: "image",
      source: {
        type: "base64",
        media_type: mediaType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
        data,
      },
    });
  }
  return { ok: true, blocks };
}

/** Compose the final user message: attached images first, then the text. */
export function buildImageUserMessage(
  text: string,
  blocks: Anthropic.ImageBlockParam[],
): Anthropic.MessageParam {
  const content: Anthropic.ContentBlockParam[] = [...blocks];
  content.push({ type: "text", text: text || "(See attached images.)" });
  return { role: "user", content };
}
