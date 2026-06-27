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

export async function uploadBugFeedbackImages(files: File[]): Promise<string[]> {
  if (files.length === 0) return [];
  if (files.length > MAX_ATTACHMENTS) {
    throw new Error(`You can attach up to ${MAX_ATTACHMENTS} images.`);
  }

  const urls: string[] = [];
  for (const file of files) {
    if (!file.type.startsWith("image/")) {
      throw new Error("Only image files can be attached.");
    }
    if (file.size > MAX_BYTES) {
      throw new Error("Each image must be 5 MB or smaller.");
    }
    const dataUrl = await readFileAsDataUrl(file);
    const res = await fetch("/api/bug-feedback-attachments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ dataUrl, ext: file.name.split(".").pop() ?? undefined }),
    });
    const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (!res.ok || !body.url) {
      throw new Error(body.error ?? "Image upload failed.");
    }
    urls.push(body.url);
  }
  return urls;
}

export { MAX_ATTACHMENTS as BUG_FEEDBACK_MAX_ATTACHMENTS };
