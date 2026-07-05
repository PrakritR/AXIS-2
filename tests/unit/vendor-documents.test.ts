import { describe, expect, it } from "vitest";
import {
  findVendorDocument,
  isVendorDocumentKind,
  removeVendorDocument,
  upsertVendorDocument,
  VENDOR_DOCUMENT_KINDS,
  VENDOR_DOCUMENT_SECTIONS,
  type VendorDocumentRecord,
} from "@/lib/vendor-documents";

describe("vendor-documents", () => {
  const sample: VendorDocumentRecord = {
    kind: "insurance",
    fileName: "cert.pdf",
    url: "https://example.com/cert.pdf",
    uploadedAt: "2026-01-01T00:00:00.000Z",
  };

  it("validates document kinds", () => {
    for (const kind of VENDOR_DOCUMENT_KINDS) {
      expect(isVendorDocumentKind(kind)).toBe(true);
    }
    expect(isVendorDocumentKind("other")).toBe(false);
  });

  it("lists every kind in a document section", () => {
    const listed = new Set(VENDOR_DOCUMENT_SECTIONS.flatMap((s) => s.kinds));
    for (const kind of VENDOR_DOCUMENT_KINDS) {
      expect(listed.has(kind)).toBe(true);
    }
  });

  it("upserts by kind", () => {
    const first = upsertVendorDocument([], sample);
    expect(first).toHaveLength(1);
    const replaced = upsertVendorDocument(first, { ...sample, fileName: "new.pdf" });
    expect(replaced).toHaveLength(1);
    expect(replaced[0]?.fileName).toBe("new.pdf");
    const added = upsertVendorDocument(replaced, {
      kind: "w9",
      fileName: "w9.pdf",
      url: "https://example.com/w9.pdf",
      uploadedAt: "2026-01-02T00:00:00.000Z",
    });
    expect(added).toHaveLength(2);
  });

  it("removes by kind", () => {
    const rows = upsertVendorDocument([], sample);
    const withW9 = upsertVendorDocument(rows, {
      kind: "w9",
      fileName: "w9.pdf",
      url: "https://example.com/w9.pdf",
      uploadedAt: "2026-01-02T00:00:00.000Z",
    });
    expect(removeVendorDocument(withW9, "insurance")).toHaveLength(1);
    expect(findVendorDocument(withW9, "w9")?.fileName).toBe("w9.pdf");
  });
});
