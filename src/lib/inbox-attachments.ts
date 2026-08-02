const MAX_ATTACHMENTS = 4;
const MAX_BYTES = 5 * 1024 * 1024;

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
};

export async function uploadInboxAttachment(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Only image files can be attached.");
  }
  if (file.size > MAX_BYTES) {
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

export { MAX_ATTACHMENTS as INBOX_MAX_ATTACHMENTS };
