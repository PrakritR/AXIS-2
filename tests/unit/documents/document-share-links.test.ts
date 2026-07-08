import { describe, expect, it } from "vitest";
import { buildDocumentShareUrl } from "@/lib/documents/document-share-links.server";

describe("document share links", () => {
  it("builds a public share URL from token", () => {
    expect(buildDocumentShareUrl("https://app.axis.test", "abc123")).toBe(
      "https://app.axis.test/share/documents/abc123",
    );
  });

  it("strips trailing slash from origin", () => {
    expect(buildDocumentShareUrl("https://app.axis.test/", "tok")).toBe(
      "https://app.axis.test/share/documents/tok",
    );
  });
});
