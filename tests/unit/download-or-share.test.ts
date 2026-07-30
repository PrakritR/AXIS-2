// @vitest-environment jsdom
//
// A synthetic `<a download>` on a blob URL is silently ignored by iOS
// WKWebView, so `downloadOrShareFile` must route native-shell saves through
// the Web Share API and only use the anchor download on the web (or as the
// native last resort). These tests pin that branch selection.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadOrShareFile } from "@/lib/native/download-or-share";

const OPTS = {
  fileName: "spring-special.html",
  mimeType: "text/html",
  content: "<!doctype html><title>Flyer</title>",
  title: "Spring special",
};

let clickSpy: ReturnType<typeof vi.spyOn>;

function setNavigatorShare(share: ((data?: ShareData) => Promise<void>) | undefined, canShare?: (data?: ShareData) => boolean) {
  Object.defineProperty(window.navigator, "share", { value: share, configurable: true, writable: true });
  Object.defineProperty(window.navigator, "canShare", { value: canShare, configurable: true, writable: true });
}

beforeEach(() => {
  Object.defineProperty(window.navigator, "userAgent", {
    value: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    configurable: true,
  });
  Object.defineProperty(window.navigator, "maxTouchPoints", { value: 0, configurable: true });
  // jsdom has no blob URL support.
  URL.createObjectURL = vi.fn(() => "blob:vitest") as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn() as typeof URL.revokeObjectURL;
  clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

afterEach(() => {
  document.documentElement.removeAttribute("data-native");
  setNavigatorShare(undefined, undefined);
  vi.restoreAllMocks();
});

describe("downloadOrShareFile", () => {
  it("uses the anchor download on the web even when Web Share exists", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setNavigatorShare(share);

    await expect(downloadOrShareFile(OPTS)).resolves.toBe("downloaded");
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(share).not.toHaveBeenCalled();
  });

  it("presents the share sheet with a File payload in the native shell", async () => {
    document.documentElement.setAttribute("data-native", "ios");
    const share = vi.fn().mockResolvedValue(undefined);
    const canShare = vi.fn().mockReturnValue(true);
    setNavigatorShare(share, canShare);

    await expect(downloadOrShareFile(OPTS)).resolves.toBe("shared");
    expect(clickSpy).not.toHaveBeenCalled();
    expect(share).toHaveBeenCalledTimes(1);
    const payload = share.mock.calls[0]![0] as ShareData;
    expect(payload.title).toBe("Spring special");
    expect(payload.files).toHaveLength(1);
    const file = payload.files![0]!;
    expect(file.name).toBe("spring-special.html");
    expect(file.type).toBe("text/html");
  });

  it("treats the user dismissing the share sheet as done — no surprise download", async () => {
    document.documentElement.setAttribute("data-native", "ios");
    const share = vi.fn().mockRejectedValue(new DOMException("cancelled", "AbortError"));
    setNavigatorShare(share);

    await expect(downloadOrShareFile(OPTS)).resolves.toBe("share-cancelled");
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it("uses the share sheet on iOS mobile web when file sharing is supported", async () => {
    Object.defineProperty(window.navigator, "userAgent", {
      value: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
      configurable: true,
    });
    const share = vi.fn().mockResolvedValue(undefined);
    setNavigatorShare(share, () => true);

    await expect(downloadOrShareFile(OPTS)).resolves.toBe("shared");
    expect(share).toHaveBeenCalledTimes(1);
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it("falls back to the anchor download when Web Share is missing", async () => {
    document.documentElement.setAttribute("data-native", "ios");
    setNavigatorShare(undefined);

    await expect(downloadOrShareFile(OPTS)).resolves.toBe("downloaded");
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it("falls back to the anchor download when canShare rejects file payloads", async () => {
    document.documentElement.setAttribute("data-native", "ios");
    const share = vi.fn().mockResolvedValue(undefined);
    setNavigatorShare(share, () => false);

    await expect(downloadOrShareFile(OPTS)).resolves.toBe("downloaded");
    expect(share).not.toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it("falls back to the anchor download when share fails for a real reason", async () => {
    document.documentElement.setAttribute("data-native", "ios");
    const share = vi.fn().mockRejectedValue(new DOMException("nope", "NotAllowedError"));
    setNavigatorShare(share, () => true);

    await expect(downloadOrShareFile(OPTS)).resolves.toBe("downloaded");
    expect(share).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });
});
