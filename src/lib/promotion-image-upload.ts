/**
 * Browser-only photo intake for promotions. Kept out of `promotion-flyer.ts`,
 * which is deliberately framework-agnostic (no `window`) so the server
 * generation route can import it.
 *
 * Every promotion upload surface — the flyer builder and the promotion-text
 * composer — shares this, so both store photos at the same size and quality.
 */

/** Longest edge of a stored promotion photo — keeps data URLs small enough to persist. */
const PROMOTION_IMAGE_MAX_DIM = 1280;

/** Largest upload we'll even attempt to read, before downscaling. */
const PROMOTION_IMAGE_MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

/**
 * Read an uploaded photo and downscale it client-side (canvas → JPEG) so the
 * stored data URL stays a reasonable size. Returns null for non-images or
 * unreadable files.
 */
export async function fileToFlyerImage(file: File): Promise<string | null> {
  if (!file.type.startsWith("image/") || file.size > PROMOTION_IMAGE_MAX_UPLOAD_BYTES) return null;
  try {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = dataUrl;
    });
    if (!img.width || !img.height) return null;
    const scale = Math.min(1, PROMOTION_IMAGE_MAX_DIM / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    // JPEG has no alpha — flatten transparent PNGs onto white, not black.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.78);
  } catch {
    return null;
  }
}
