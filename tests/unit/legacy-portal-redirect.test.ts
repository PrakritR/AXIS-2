import { describe, expect, it } from "vitest";
import { legacyPaidPortalToPortal } from "@/lib/legacy-portal-redirect";

describe("legacy-portal-redirect", () => {
  it("redirects legacy manager paths", () => {
    expect(legacyPaidPortalToPortal("/manager")).toBe("/portal/dashboard");
    expect(legacyPaidPortalToPortal("/manager/properties")).toBe("/portal/properties");
  });

  it("redirects legacy owner and pro paths", () => {
    expect(legacyPaidPortalToPortal("/owner/leases")).toBe("/portal/leases");
    expect(legacyPaidPortalToPortal("/pro/inbox")).toBe("/portal/inbox");
  });

  it("returns null for non-legacy paths", () => {
    expect(legacyPaidPortalToPortal("/portal/dashboard")).toBeNull();
    expect(legacyPaidPortalToPortal("/resident/dashboard")).toBeNull();
  });
});
