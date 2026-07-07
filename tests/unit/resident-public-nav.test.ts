import { describe, expect, it } from "vitest";
import {
  residentBrowseFromAuthHref,
  residentCreateAccountHref,
  residentPortalPublicHref,
  residentSignInHref,
} from "@/lib/resident-public-nav";

describe("residentBrowseFromAuthHref", () => {
  it("points at public browse with auth return marker", () => {
    expect(residentBrowseFromAuthHref()).toBe("/rent/browse?from=auth");
  });
});

describe("residentPortalPublicHref", () => {
  it("sends signed-in residents to the portal", () => {
    expect(
      residentPortalPublicHref({ signedIn: true, isResident: true, nextPath: "/resident/applications/apply?propertyId=x" }),
    ).toBe("/resident/applications/apply?propertyId=x");
  });

  it("routes guests to resident sign-in", () => {
    expect(residentPortalPublicHref({ signedIn: false, isResident: false })).toBe(
      residentSignInHref("/resident/applications"),
    );
  });

  it("routes signed-in non-residents to resident create-account", () => {
    expect(residentPortalPublicHref({ signedIn: true, isResident: false })).toBe(
      residentCreateAccountHref("/resident/applications"),
    );
  });
});
