import { describe, expect, it } from "vitest";
import { validateDocumentVisibilityScope } from "@/lib/documents/manager-documents";

describe("validateDocumentVisibilityScope", () => {
  it("allows manager-only visibility without recipient fields", () => {
    expect(validateDocumentVisibilityScope({ visibility: "manager" })).toBeNull();
  });

  it("requires resident email or user id when sharing with resident", () => {
    expect(validateDocumentVisibilityScope({ visibility: "resident" })).toMatch(/resident/i);
    expect(
      validateDocumentVisibilityScope({
        visibility: "resident",
        residentEmail: "resident@example.com",
      }),
    ).toBeNull();
  });

  it("requires vendor id when sharing with vendor", () => {
    expect(validateDocumentVisibilityScope({ visibility: "vendor" })).toMatch(/vendor/i);
    expect(
      validateDocumentVisibilityScope({
        visibility: "vendor",
        vendorId: "vendor-dir-1",
      }),
    ).toBeNull();
  });
});
