import { describe, expect, it } from "vitest";
import {
  coManagerPortalSectionAllowed,
  flatCoManagerPermissionsFromProperty,
  hasCoManagerPermission,
  mergeCoManagerPermissionsFromPropertyRows,
  normalizeCoManagerPermissions,
  normalizePropertyCoManagerPermissions,
  permissionsForProperty,
} from "@/lib/co-manager-permissions";
import { deriveManagerNavRole } from "@/lib/co-manager-nav";

describe("normalizePropertyCoManagerPermissions", () => {
  it("expands legacy flat permissions to each assigned property", () => {
    const result = normalizePropertyCoManagerPermissions(
      { applications: true, payments: true },
      ["prop-a", "prop-b"],
    );
    expect(result).toEqual({
      "prop-a": { applications: true, payments: true },
      "prop-b": { applications: true, payments: true },
    });
  });

  it("keeps per-property maps", () => {
    const result = normalizePropertyCoManagerPermissions(
      {
        "prop-a": { applications: true },
        "prop-b": { payments: true },
      },
      ["prop-a", "prop-b"],
    );
    expect(permissionsForProperty(result, "prop-a")).toEqual({ applications: true });
    expect(permissionsForProperty(result, "prop-b")).toEqual({ payments: true });
  });
});

describe("mergeCoManagerPermissionsFromPropertyRows", () => {
  it("merges permissions across properties on multiple links", () => {
    const merged = mergeCoManagerPermissionsFromPropertyRows([
      {
        propertyCoManagerPermissions: {
          "prop-a": { applications: true },
          "prop-b": { inbox: true },
        },
      },
      {
        propertyCoManagerPermissions: {
          "prop-c": { payments: true },
        },
      },
    ]);
    expect(merged).toEqual({ applications: true, inbox: true, payments: true });
  });

  it("falls back to flat coManagerPermissions", () => {
    const merged = mergeCoManagerPermissionsFromPropertyRows([
      { coManagerPermissions: { leases: true } },
    ]);
    expect(merged).toEqual({ leases: true });
  });
});

describe("flatCoManagerPermissionsFromProperty", () => {
  it("unions permissions across properties", () => {
    const flat = flatCoManagerPermissionsFromProperty({
      "prop-a": { applications: true },
      "prop-b": { payments: true, applications: true },
    });
    expect(flat).toEqual({ applications: true, payments: true });
  });
});

describe("coManagerPortalSectionAllowed", () => {
  it("allows promotion when granted", () => {
    expect(
      coManagerPortalSectionAllowed({
        section: "promotion",
        isPrimaryManager: false,
        mergedPermissions: { promotion: true },
      }),
    ).toBe(true);
  });

  it("hides ungranted module sections when merged permissions are non-empty", () => {
    expect(
      coManagerPortalSectionAllowed({
        section: "payments",
        isPrimaryManager: false,
        mergedPermissions: { promotion: true },
      }),
    ).toBe(false);
  });

  it("shows module sections for an empty-permission co-manager link", () => {
    for (const section of ["payments", "residents", "financials", "services"]) {
      expect(
        coManagerPortalSectionAllowed({
          section,
          isPrimaryManager: false,
          mergedPermissions: {},
          hasEmptyPermissionCoManagerLink: true,
        }),
      ).toBe(true);
    }
  });

  it("keeps relationships gated even for an empty-permission co-manager link", () => {
    expect(
      coManagerPortalSectionAllowed({
        section: "relationships",
        isPrimaryManager: false,
        mergedPermissions: {},
        hasEmptyPermissionCoManagerLink: true,
      }),
    ).toBe(false);
  });

  it("does not unlock unknown sections for an empty-permission co-manager link", () => {
    expect(
      coManagerPortalSectionAllowed({
        section: "some-unknown-section",
        isPrimaryManager: false,
        mergedPermissions: {},
        hasEmptyPermissionCoManagerLink: true,
      }),
    ).toBe(false);
  });

  it("still hides ungranted modules when the flag is absent (default behavior)", () => {
    expect(
      coManagerPortalSectionAllowed({
        section: "payments",
        isPrimaryManager: false,
        mergedPermissions: {},
      }),
    ).toBe(false);
  });
});

describe("hasCoManagerPermission", () => {
  it("treats properties permission as listing edit access", () => {
    expect(hasCoManagerPermission({ properties: true }, "editListings")).toBe(true);
  });

  it("maps legacy editListings reads to properties on normalize", () => {
    expect(normalizeCoManagerPermissions({ editListings: true })).toEqual({
      editListings: true,
      properties: true,
    });
  });
});

describe("deriveManagerNavRole with per-property permissions", () => {
  it("merges incoming per-property permissions for co-managers", () => {
    const role = deriveManagerNavRole([
      {
        direction: "incoming",
        status: "accepted",
        coManagerPermissions: {},
        propertyCoManagerPermissions: {
          "prop-a": { applications: true },
          "prop-b": { inbox: true },
        },
      },
    ]);
    expect(role.isPrimaryManager).toBe(false);
    expect(role.mergedPermissions).toEqual({ applications: true, inbox: true });
  });
});
