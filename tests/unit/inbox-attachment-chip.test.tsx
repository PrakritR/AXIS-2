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
// about:blank tab while the file downloaded.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { InboxBubble, type InboxBubbleMessage } from "@/components/portal/portal-inbox-ui";
import { inboxAttachmentServeUrl } from "@/lib/inbox-attachments.server";

afterEach(cleanup);

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

  it("downloads in place instead of stranding an empty tab", () => {
    const { container } = render(<InboxBubble message={bubble([{ url: pdfUrl }, { url: pngUrl }])} />);
    const anchors = Array.from(container.querySelectorAll("a"));
    expect(anchors).toHaveLength(2);
    for (const a of anchors) {
      expect(a.getAttribute("target")).toBeNull();
      expect(a.hasAttribute("download")).toBe(true);
    }
  });
});
