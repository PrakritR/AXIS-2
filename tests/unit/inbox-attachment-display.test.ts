import { describe, expect, it } from "vitest";
import {
  attachmentMetaFromUrls,
  inboxAttachmentDisplayName,
  inboxAttachmentPathFromServeUrl,
} from "@/lib/inbox-attachments";
import { inboxAttachmentServeUrl } from "@/lib/inbox-attachments.server";
import { inboxAttachmentLooksLikePdf } from "@/components/portal/portal-inbox-ui";

const OWNER = "b5809cf3-dcff-4e46-a0cc-5dcc53bc8910";
const pdfUrl = inboxAttachmentServeUrl(`${OWNER}/1785760142643-3cbab42a/2026-lease-addendum.pdf`);
const pngUrl = inboxAttachmentServeUrl(`${OWNER}/1785760003060-4075a9ef/floorplan.pdf.png`);

describe("inboxAttachmentDisplayName", () => {
  it("reads the uploader's name out of ?path=, not the URL's last segment", () => {
    // The serve URL percent-encodes the whole path, so its own last "/" segment
    // is the route name. Splitting the URL labelled every recipient-side
    // attachment "inbox-attachments".
    expect(pdfUrl.split("/").pop()?.split("?")[0]).toBe("inbox-attachments");
    expect(inboxAttachmentDisplayName(pdfUrl)).toBe("2026-lease-addendum.pdf");
    expect(inboxAttachmentDisplayName(pngUrl)).toBe("floorplan.pdf.png");
  });

  it("gives sender and recipient the same label", () => {
    expect(attachmentMetaFromUrls([pdfUrl, pngUrl])).toEqual([
      { url: pdfUrl, name: "2026-lease-addendum.pdf" },
      { url: pngUrl, name: "floorplan.pdf.png" },
    ]);
  });

  it("survives a URL with no path param", () => {
    expect(inboxAttachmentPathFromServeUrl("/api/portal/inbox-attachments")).toBe("");
    expect(inboxAttachmentDisplayName("https://cdn.example/photo.jpg")).toBe("photo.jpg");
  });
});

describe("inboxAttachmentLooksLikePdf", () => {
  it("matches a .pdf suffix", () => {
    expect(inboxAttachmentLooksLikePdf({ url: pdfUrl, name: "2026-lease-addendum.pdf" })).toBe(true);
  });

  it("does NOT match an image whose name merely contains .pdf", () => {
    // A substring test rendered `floorplan.pdf.png` as a document link instead
    // of the inline preview the recipient should see.
    expect(inboxAttachmentLooksLikePdf({ url: pngUrl, name: "floorplan.pdf.png" })).toBe(false);
    expect(inboxAttachmentLooksLikePdf({ url: pngUrl })).toBe(false);
  });

  it("falls back to the storage path extension when no name is stored", () => {
    expect(inboxAttachmentLooksLikePdf({ url: pdfUrl })).toBe(true);
  });
});
