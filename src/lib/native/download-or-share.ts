import { isNativeRuntimeSync } from "@/lib/native/detect-native";

export type DownloadOrShareResult = "downloaded" | "shared" | "share-cancelled";

type ShareCapableNavigator = Navigator & {
  canShare?: (data?: ShareData) => boolean;
  share?: (data?: ShareData) => Promise<void>;
};

/** Classic anchor + blob-URL download — the web path. */
export function triggerBrowserDownload(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function prefersFileShareSheet(): boolean {
  if (isNativeRuntimeSync()) return true;
  if (typeof navigator === "undefined") return false;
  const isIOS =
    /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return isIOS;
}

/**
 * Save a client-generated file on any platform. On web this is the ordinary
 * anchor download. In the Capacitor shell a synthetic `<a download>` on a blob
 * URL is silently ignored by WKWebView, so present the system share sheet
 * (Save to Files / AirDrop / Mail / …) via the Web Share API instead.
 *
 * The user dismissing the share sheet is a normal outcome
 * (`"share-cancelled"`), not an error; genuine share failures fall back to the
 * anchor download as a best effort rather than throwing.
 */
export async function downloadOrShareFile({
  fileName,
  mimeType,
  content,
  title,
}: {
  fileName: string;
  mimeType: string;
  content: BlobPart;
  title?: string;
}): Promise<DownloadOrShareResult> {
  const blob = new Blob([content], { type: mimeType });
  const nav = navigator as ShareCapableNavigator;
  const file = new File([blob], fileName, { type: mimeType });
  const payload: ShareData = { files: [file], title: title ?? fileName };
  const canUseShare =
    prefersFileShareSheet() &&
    typeof nav.share === "function" &&
    (!nav.canShare || nav.canShare(payload));

  if (canUseShare) {
    try {
      await nav.share(payload);
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return "share-cancelled";
      }
    }
  }

  triggerBrowserDownload(fileName, blob);
  return "downloaded";
}
