import { describe, expect, it } from "vitest";
import {
  CO_MANAGER_PERMISSION_OPTIONS,
  coManagerPermissionsFromLegacy,
  coManagerPortalSectionAllowed,
  countCoManagerPermissions,
  mergeCoManagerPermissions,
  normalizeCoManagerPermissions,
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
    expect(
      coManagerPortalSectionAllowed({ section: "bugs-feedback", isPrimaryManager: false, mergedPermissions: {} }),
    ).toBe(true);
  });

  it("maps calendar, services, documents, and finances to permission grants", () => {
    const calendarOnly = mergeCoManagerPermissions([{ coManagerPermissions: { calendar: true } }]);
    expect(
      coManagerPortalSectionAllowed({ section: "calendar", isPrimaryManager: false, mergedPermissions: calendarOnly }),
    ).toBe(true);
    expect(
      coManagerPortalSectionAllowed({ section: "documents", isPrimaryManager: false, mergedPermissions: calendarOnly }),
    ).toBe(false);

    const propertiesOnly = mergeCoManagerPermissions([{ coManagerPermissions: { properties: true } }]);
    expect(
      coManagerPortalSectionAllowed({ section: "services", isPrimaryManager: false, mergedPermissions: propertiesOnly }),
    ).toBe(true);

    const documentsOnly = mergeCoManagerPermissions([{ coManagerPermissions: { documents: true } }]);
    expect(
      coManagerPortalSectionAllowed({ section: "documents", isPrimaryManager: false, mergedPermissions: documentsOnly }),
    ).toBe(true);
    expect(
      coManagerPortalSectionAllowed({ section: "financials", isPrimaryManager: false, mergedPermissions: documentsOnly }),
    ).toBe(false);

    const financesOnly = mergeCoManagerPermissions([{ coManagerPermissions: { financials: true } }]);
    expect(
      coManagerPortalSectionAllowed({ section: "financials", isPrimaryManager: false, mergedPermissions: financesOnly }),
    ).toBe(true);
  });
});

describe("co-manager permissions normalization", () => {
  it("keeps only known permission ids", () => {
    expect(
      normalizeCoManagerPermissions({
        applications: true,
        payments: true,
        unknown: true,
      }),
    ).toEqual({ applications: true, payments: true });
  });

  it("merges permissions across multiple co-manager links", () => {
    const merged = mergeCoManagerPermissions([
      { coManagerPermissions: { applications: true } },
      { coManagerPermissions: { payments: true, inbox: true } },
    ]);
    expect(merged).toEqual({ applications: true, payments: true, inbox: true });
    expect(countCoManagerPermissions(merged)).toBe(3);
  });

  it("migrates legacy canEditListing checkbox", () => {
    expect(coManagerPermissionsFromLegacy({ canEditListing: true })).toEqual({ editListings: true });
    expect(
      coManagerPermissionsFromLegacy({
        canEditListing: true,
        coManagerPermissions: { properties: true },
      }),
    ).toEqual({ properties: true, editListings: true });
  });

  it("exposes all permission options for the co-manager UI", () => {
    expect(CO_MANAGER_PERMISSION_OPTIONS.map((o) => o.id)).toEqual(
      expect.arrayContaining(["properties", "editListings", "applications", "calendar", "documents", "financials", "services"]),
    );
  });
});
