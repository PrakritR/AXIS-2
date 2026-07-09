import { describe, expect, it } from "vitest";
import { shouldNotifyVendorDocumentsLoadFailure } from "@/lib/vendor-documents-client";

describe("shouldNotifyVendorDocumentsLoadFailure", () => {
  it("suppresses toast for expected auth failures", () => {
    expect(shouldNotifyVendorDocumentsLoadFailure(401)).toBe(false);
    expect(shouldNotifyVendorDocumentsLoadFailure(403)).toBe(false);
  });

  it("allows toast for unexpected server failures", () => {
    expect(shouldNotifyVendorDocumentsLoadFailure(500)).toBe(true);
    expect(shouldNotifyVendorDocumentsLoadFailure(404)).toBe(true);
  });
});
