import { describe, expect, it } from "vitest";
import {
  applicationListHref,
  legacyManagerPortalSectionPath,
  propertyListHref,
} from "@/lib/portal-detail-routes";

describe("portal-detail-routes href helpers", () => {
  const base = "/portal";

  it("builds property stage list URLs from the portal root", () => {
    expect(propertyListHref(base, "drafts")).toBe("/portal/properties/drafts");
    expect(propertyListHref(base, "listed")).toBe("/portal/properties/listed");
  });

  it("builds application bucket list URLs from the portal root", () => {
    expect(applicationListHref(base, "approved")).toBe("/portal/applications/approved");
    expect(applicationListHref(base, "pending")).toBe("/portal/applications/pending");
  });

  it("redirects mistaken top-level segments to routed section paths", () => {
    expect(legacyManagerPortalSectionPath("drafts")).toBe("properties/drafts");
    expect(legacyManagerPortalSectionPath("approved")).toBe("applications/approved");
    expect(legacyManagerPortalSectionPath("manager")).toBe("leases/manager");
    expect(legacyManagerPortalSectionPath("dashboard")).toBeNull();
  });
});
