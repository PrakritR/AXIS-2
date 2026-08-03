const MAX_ATTACHMENTS = 4;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_PDF_BYTES = 10 * 1024 * 1024;

export const INBOX_ATTACHMENT_ACCEPT =
  "image/jpeg,image/png,image/webp,image/gif,image/*,application/pdf,.pdf";

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}

export type InboxComposerAttachment = {
  id: string;
  fileName: string;
  previewUrl: string;
  uploadUrl?: string;
  uploading?: boolean;
  error?: string;
  /** False for PDFs and other non-image files. */
  isImage?: boolean;
};

function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

function isImageFile(file: File): boolean {
  return (
    file.type.startsWith("image/") ||
    /\.(jpe?g|png|webp|gif)$/i.test(file.name)
  );
}

export async function uploadInboxAttachment(file: File): Promise<string> {
  if (isPdfFile(file)) {
    if (file.size > MAX_PDF_BYTES) {
      throw new Error("Each PDF must be 10 MB or smaller.");
    }
    const dataUrl = await readFileAsDataUrl(file);
    const res = await fetch("/api/portal/inbox-attachments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ dataUrl, ext: "pdf" }),
    });
    const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (!res.ok || !body.url) {
      throw new Error(body.error ?? "PDF upload failed.");
    }
    return body.url;
  }

  if (!isImageFile(file)) {
    throw new Error("Attach JPEG, PNG, WebP, GIF images, or PDF documents.");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("Each image must be 5 MB or smaller.");
  }
  const dataUrl = await readFileAsDataUrl(file);
  const res = await fetch("/api/portal/inbox-attachments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ dataUrl, ext: file.name.split(".").pop() ?? undefined }),
  });
  const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !body.url) {
    throw new Error(body.error ?? "Image upload failed.");
  }
  return body.url;
}

export function attachmentMetaFromUrls(urls: string[]): { url: string; name?: string }[] {
  return urls.map((url) => {
    const raw = decodeURIComponent(url.split("path=")[1]?.split("&")[0] ?? "");
    const name = raw.split("/").pop()?.trim() || url.split("/").pop()?.split("?")[0]?.trim();
    return name ? { url, name } : { url };
  });
}

export function createPendingInboxAttachment(file: File): InboxComposerAttachment {
  const id = `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const image = isImageFile(file);
  return {
    id,
    fileName: file.name,
    previewUrl: image ? URL.createObjectURL(file) : "",
    uploading: true,
    isImage: image,
  };
}

export function revokeInboxAttachmentPreview(att: InboxComposerAttachment): void {
  if (att.previewUrl) URL.revokeObjectURL(att.previewUrl);
}

export { MAX_ATTACHMENTS as INBOX_MAX_ATTACHMENTS };
