import { describe, expect, it } from "vitest";
import {
  coManagerPortalSectionAllowed,
  mergeCoManagerPermissions,
} from "@/lib/co-manager-permissions";

describe("co-manager portal access", () => {
  it("primary managers see all sections including co-managers", () => {
    expect(
      coManagerPortalSectionAllowed({
        section: "relationships",
        isPrimaryManager: true,
        mergedPermissions: {},
      }),
    ).toBe(true);
  });

  it("co-managers only see granted sections", () => {
    const merged = mergeCoManagerPermissions([{ coManagerPermissions: { applications: true } }]);
    expect(
      coManagerPortalSectionAllowed({ section: "applications", isPrimaryManager: false, mergedPermissions: merged }),
    ).toBe(true);
    expect(
      coManagerPortalSectionAllowed({ section: "payments", isPrimaryManager: false, mergedPermissions: merged }),
    ).toBe(false);
    expect(
      coManagerPortalSectionAllowed({ section: "relationships", isPrimaryManager: false, mergedPermissions: merged }),
    ).toBe(false);
  });

  it("co-managers always see dashboard and profile", () => {
    expect(
      coManagerPortalSectionAllowed({ section: "dashboard", isPrimaryManager: false, mergedPermissions: {} }),
    ).toBe(true);
    expect(
      coManagerPortalSectionAllowed({ section: "profile", isPrimaryManager: false, mergedPermissions: {} }),
    ).toBe(true);
  });
});
