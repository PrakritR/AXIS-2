import {
  downloadOrShareFile,
  type DownloadOrShareResult,
} from "@/lib/native/download-or-share";

export type PortalDownloadResult = DownloadOrShareResult | "failed";

function safeFileSegment(raw: string): string {
  return raw.trim().replace(/[^\w\-]+/g, "_").slice(0, 60) || "document";
}

export async function downloadBlobFile({
  fileName,
  mimeType,
  blob,
  title,
}: {
  fileName: string;
  mimeType: string;
  blob: Blob;
  title?: string;
}): Promise<PortalDownloadResult> {
  try {
    return await downloadOrShareFile({
      fileName,
      mimeType,
      content: blob,
      title,
    });
  } catch {
    return "failed";
  }
}

export async function downloadFetchedUrl(
  url: string,
  fileName: string,
  mimeType: string,
  title?: string,
): Promise<PortalDownloadResult> {
  try {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) return "failed";
    const blob = await res.blob();
    return downloadBlobFile({ fileName, mimeType, blob, title });
  } catch {
    return "failed";
  }
}

export async function downloadDataUrl(dataUrl: string, fileName: string): Promise<PortalDownloadResult> {
  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const mimeType = blob.type || "application/octet-stream";
    return downloadBlobFile({ fileName, mimeType, blob, title: fileName });
  } catch {
    return "failed";
  }
}

export async function downloadTextContent(
  content: string,
  fileName: string,
  mimeType: string,
  title?: string,
): Promise<PortalDownloadResult> {
  return downloadBlobFile({
    fileName,
    mimeType,
    blob: new Blob([content], { type: mimeType }),
    title,
  });
}

export function portalDownloadToastMessage(
  result: PortalDownloadResult,
  label: "application" | "lease",
): string | null {
  if (result === "failed") {
    return label === "application" ? "Could not download application." : "Could not download lease.";
  }
  if (result === "share-cancelled") return null;
  if (result === "shared") {
    return label === "application"
      ? "Choose “Save to Files” in the share sheet to keep the application PDF."
      : "Choose “Save to Files” in the share sheet to keep the lease.";
  }
  return label === "application" ? "Application download started." : "Lease download started.";
}

export function leaseDownloadBaseName(row: { residentName?: string | null; residentEmail?: string | null }): string {
  const raw = (row.residentName ?? row.residentEmail?.split("@")[0] ?? "resident").trim();
  return safeFileSegment(raw);
}
