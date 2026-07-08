import { describe, expect, it } from "vitest";
import { documentSignatureBadgeTone, validateDocumentVersionUpload } from "@/lib/documents/manager-documents";

describe("validateDocumentVersionUpload", () => {
  it("rejects cross-manager version uploads", () => {
    expect(
      validateDocumentVersionUpload({
        priorManagerUserId: "manager-a",
        managerUserId: "manager-b",
        priorSupersededByDocumentId: null,
      }),
    ).toBe("Document not found.");
  });

  it("rejects replacing an already superseded document", () => {
    expect(
      validateDocumentVersionUpload({
        priorManagerUserId: "manager-a",
        managerUserId: "manager-a",
        priorSupersededByDocumentId: "next-doc-id",
      }),
    ).toBe("That document version was already replaced.");
  });

  it("allows a fresh version upload", () => {
    expect(
      validateDocumentVersionUpload({
        priorManagerUserId: "manager-a",
        managerUserId: "manager-a",
        priorSupersededByDocumentId: null,
      }),
    ).toBeNull();
  });
});

describe("documentSignatureBadgeTone", () => {
  it("maps signature statuses to shared badge tones", () => {
    expect(documentSignatureBadgeTone("pending")).toBe("pending");
    expect(documentSignatureBadgeTone("signed")).toBe("confirmed");
    expect(documentSignatureBadgeTone("declined")).toBe("overdue");
    expect(documentSignatureBadgeTone(null)).toBe("neutral");
  });
});
