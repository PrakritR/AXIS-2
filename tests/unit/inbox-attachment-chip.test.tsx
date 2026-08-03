// @vitest-environment jsdom
//
// The attachment chip in a message bubble derives its label from the storage
// key, NOT from the copy persisted in `row_data`. Every message sent before the
// key carried the uploader's file name has the literal string
// "inbox-attachments" stored there and is never backfilled, so trusting the
// stored copy leaves existing conversations mislabelled forever.
//
// The chips are also same-origin links to a route that answers
// `Content-Disposition: attachment`, so `target="_blank"` only stranded an empty
// about:blank tab while the file downloaded — and WKWebView honours neither that
// disposition nor `<a download>`, so the Capacitor shell needs the share sheet.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { InboxBubble, type InboxBubbleMessage } from "@/components/portal/portal-inbox-ui";
import { inboxAttachmentServeUrl } from "@/lib/inbox-attachments.server";
import { downloadOrShareFile } from "@/lib/native/download-or-share";

vi.mock("@/lib/native/download-or-share", () => ({
  downloadOrShareFile: vi.fn(async () => "shared" as const),
}));

const shareMock = vi.mocked(downloadOrShareFile);

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("data-native");
  shareMock.mockClear();
  vi.unstubAllGlobals();
});

const OWNER = "b5809cf3-dcff-4e46-a0cc-5dcc53bc8910";
const pdfUrl = inboxAttachmentServeUrl(`${OWNER}/1785760142643-3cbab42a/2026-lease-addendum.pdf`);
const pngUrl = inboxAttachmentServeUrl(`${OWNER}/1785760003060-4075a9ef/floorplan.pdf.png`);
const legacyPdfUrl = inboxAttachmentServeUrl(`${OWNER}/1785760142643-3cbab42a.pdf`);

function bubble(attachments: { url: string; name?: string }[]): InboxBubbleMessage {
  return {
    id: "m1",
    author: "Dana",
    body: "Here you go",
    at: "Jul 20",
    direction: "inbound",
    attachments,
  };
}

describe("inbox bubble attachment chips", () => {
  it("re-derives the name from the storage key when row_data stored 'inbox-attachments'", () => {
    render(<InboxBubble message={bubble([{ url: pdfUrl, name: "inbox-attachments" }])} />);
    expect(screen.getByText("2026-lease-addendum.pdf")).toBeTruthy();
    expect(screen.queryByText("inbox-attachments")).toBeNull();
  });

  it("labels an image preview from the storage key too", () => {
    render(<InboxBubble message={bubble([{ url: pngUrl, name: "inbox-attachments" }])} />);
    const img = screen.getByAltText("floorplan.pdf.png") as HTMLImageElement;
    expect(img.tagName).toBe("IMG");
  });

  it("still reads a legacy two-segment path as a document chip", () => {
    render(<InboxBubble message={bubble([{ url: legacyPdfUrl }])} />);
    expect(screen.getByText("1785760142643-3cbab42a.pdf")).toBeTruthy();
  });

  it("keeps the persisted name when a serve URL lost its ?path=", () => {
    render(<InboxBubble message={bubble([{ url: "/api/portal/inbox-attachments", name: "lease.pdf" }])} />);
    expect(screen.getByText("lease.pdf")).toBeTruthy();
    expect(screen.queryByText("inbox-attachments")).toBeNull();
  });

  it("downloads in place instead of stranding an empty tab", () => {
    const { container } = render(<InboxBubble message={bubble([{ url: pdfUrl }, { url: pngUrl }])} />);
    const anchors = Array.from(container.querySelectorAll("a"));
    expect(anchors).toHaveLength(2);
    for (const a of anchors) {
      expect(a.getAttribute("target")).toBeNull();
      expect(a.hasAttribute("download")).toBe(true);
    }
    expect(shareMock).not.toHaveBeenCalled();
  });

  it("hands the bytes to the OS share sheet inside the Capacitor shell", async () => {
    // WKWebView ignores both Content-Disposition: attachment (no
    // WKDownloadDelegate) and a synthetic <a download>, so the plain anchor is a
    // tap that does nothing in the iOS app.
    document.documentElement.setAttribute("data-native", "ios");
    const blob = new Blob(["%PDF-1.4"], { type: "application/pdf" });
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, blob: async () => blob }));
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(<InboxBubble message={bubble([{ url: pdfUrl }])} />);
    const anchor = container.querySelector("a")!;
    const evt = new MouseEvent("click", { bubbles: true, cancelable: true });
    fireEvent(anchor, evt);

    expect(evt.defaultPrevented).toBe(true);
    await waitFor(() => expect(shareMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(pdfUrl, { credentials: "include" });
    expect(shareMock.mock.calls[0]![0]).toMatchObject({
      fileName: "2026-lease-addendum.pdf",
      mimeType: "application/pdf",
    });
  });

  it("derives the mime type from the file name when the response has none", async () => {
    document.documentElement.setAttribute("data-native", "ios");
    const blob = new Blob(["%PDF-1.4"]);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, blob: async () => blob })));

    const { container } = render(<InboxBubble message={bubble([{ url: pdfUrl }])} />);
    fireEvent.click(container.querySelector("a")!);

    await waitFor(() => expect(shareMock).toHaveBeenCalledTimes(1));
    expect(shareMock.mock.calls[0]![0]!.mimeType).toBe("application/pdf");
  });

  it("surfaces a failed native fetch instead of leaving a dead tap", async () => {
    document.documentElement.setAttribute("data-native", "ios");
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 403, blob: async () => new Blob([]) })));

    const { container } = render(<InboxBubble message={bubble([{ url: pdfUrl }])} />);
    fireEvent.click(container.querySelector("a")!);

    expect(await screen.findByText("Couldn't open this attachment.")).toBeTruthy();
    expect(shareMock).not.toHaveBeenCalled();
  });
});
