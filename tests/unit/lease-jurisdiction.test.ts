import { describe, expect, it } from "vitest";
import { snapshotJordanLee } from "@/data/manager-application-snapshots";
import { leaseContextFromApplication } from "@/lib/generated-lease";
import {
  CALIFORNIA_LEASE_CONFIG,
  SAN_FRANCISCO_LEASE_CONFIG,
  SEATTLE_LEASE_CONFIG,
  WASHINGTON_LEASE_CONFIG,
} from "@/lib/lease-templates/types";
import {
  isLeaseGenerationSupported,
  jurisdictionConfig,
  jurisdictionRuleScopes,
  resolveJurisdiction,
  resolveLeaseJurisdiction,
  unsupportedJurisdictionMessage,
} from "@/lib/lease-jurisdiction";

describe("lease-jurisdiction", () => {
  it("detects Seattle from address", () => {
    const app = snapshotJordanLee();
    const ctx = leaseContextFromApplication({
      ...app,
      propertyId: app.propertyId,
    });
    const withSeattle = {
      ...ctx,
      leasedRoom: undefined,
      listingProperty: ctx.listingProperty
        ? { ...ctx.listingProperty, address: "5259 Brooklyn Ave NE, Seattle, WA", neighborhood: "Seattle" }
        : undefined,
    };
    expect(resolveLeaseJurisdiction(withSeattle)).toBe("seattle");
    expect(isLeaseGenerationSupported(resolveLeaseJurisdiction(withSeattle))).toBe(true);
  });

  it("detects Seattle from Brooklyn Ave NE street address without city/state", () => {
    expect(resolveLeaseJurisdiction({
      listingProperty: { address: "5257 Brooklyn Ave NE" },
    })).toBe("seattle");
  });

  it("detects Seattle from property ZIP when address omits city/state", () => {
    expect(resolveLeaseJurisdiction({
      listingProperty: { address: "5257 Brooklyn Ave NE", zip: "98105" },
    })).toBe("seattle");
  });

  it("detects San Francisco from address", () => {
    const app = snapshotJordanLee();
    const ctx = leaseContextFromApplication(app);
    const sfCtx = {
      ...ctx,
      leasedRoom: undefined,
      submission: { ...(ctx.submission ?? { v: 1 as const, buildingName: "SF House", address: "123 Market St, San Francisco, CA", neighborhood: "SOMA", zip: "94103", rooms: [], sharedSpaces: [] }), address: "123 Market St, San Francisco, CA" },
      listingProperty: {
        ...(ctx.listingProperty ?? { id: "sf-test", title: "SF House", tagline: "", zip: "94103", beds: 1, baths: 1, rentLabel: "$1000", available: "Now", petFriendly: false, buildingId: "b1", buildingName: "SF House", unitLabel: "Room 1", adminPublishLive: true }),
        address: "123 Market St, San Francisco, CA 94103",
        neighborhood: "SOMA",
      },
    };
    expect(resolveLeaseJurisdiction(sfCtx)).toBe("san_francisco");
  });

  it("returns unsupported for other cities", () => {
    const app = snapshotJordanLee();
    const ctx = leaseContextFromApplication(app);
    const portlandCtx = {
      ...ctx,
      leasedRoom: undefined,
      submission: ctx.submission ? { ...ctx.submission, address: "1000 SW Broadway, Portland, OR" } : { v: 1 as const, buildingName: "PDX", address: "1000 SW Broadway, Portland, OR", neighborhood: "Portland", zip: "97201", rooms: [], sharedSpaces: [] },
      listingProperty: {
        ...(ctx.listingProperty ?? { id: "pdx-test", title: "PDX House", tagline: "", zip: "97201", beds: 1, baths: 1, rentLabel: "$1000", available: "Now", petFriendly: false, buildingId: "b1", buildingName: "PDX", unitLabel: "Room 1", adminPublishLive: true }),
        address: "1000 SW Broadway, Portland, OR",
        neighborhood: "Portland",
      },
      application: { ...ctx.application, currentCity: "Portland", currentState: "OR" },
    };
    expect(resolveLeaseJurisdiction(portlandCtx)).toBe("unsupported");
    expect(unsupportedJurisdictionMessage("unsupported")).toContain("California and Washington");
  });

  // A state-only match used to fall through to that state's CITY template, so a Fremont
  // lease claimed "City and County of San Francisco" and carried the SF Rent Ordinance.
  it("uses the statewide template for a supported state outside the two cities", () => {
    expect(resolveLeaseJurisdiction({ listingProperty: { address: "3200 Walnut Ave, Fremont, CA", zip: "94538" } })).toBe(
      "california",
    );
    expect(resolveLeaseJurisdiction({ listingProperty: { address: "1000 Pacific Ave, Tacoma, WA", zip: "98402" } })).toBe(
      "washington",
    );
  });

  it("still prefers an explicit city match over the statewide fallback", () => {
    expect(resolveLeaseJurisdiction({ listingProperty: { address: "123 Market St, San Francisco, CA" } })).toBe(
      "san_francisco",
    );
    expect(resolveLeaseJurisdiction({ listingProperty: { address: "1500 Pike St, Seattle, WA" } })).toBe("seattle");
  });

  it.each([
    ["Fremont, California", "3200 Walnut Ave, Fremont, CA 94538", { state: "CA" }],
    ["San Francisco, California", "1 Dr Carlton B Goodlett Pl, San Francisco, CA 94102", { state: "CA", city: "san_francisco" }],
    ["Seattle, Washington", "1500 Pike St, Seattle, WA 98101", { state: "WA", city: "seattle" }],
    ["Spokane, Washington", "808 W Spokane Falls Blvd, Spokane, WA 99201", { state: "WA" }],
    ["Austin, Texas", "301 W 2nd St, Austin, TX 78701", null],
  ])("resolves %s to the typed jurisdiction key", (_name, address, expected) => {
    expect(resolveJurisdiction({ listingProperty: { address } })).toEqual(expected);
  });

  it("prefers structured property city and state fields before the joined address fallback", () => {
    const key = resolveJurisdiction({
      listingProperty: {
        address: "1 Dr Carlton B Goodlett Pl, San Francisco, CA 94102",
        city: "Fremont",
        state: "CA",
      },
    });
    expect(key).toEqual({ state: "CA" });
    expect(jurisdictionConfig(key!)).not.toBeNull();
  });

  it("treats the listing property as authoritative when structured sources differ", () => {
    expect(
      resolveJurisdiction({
        listingProperty: { city: "Spokane", state: "WA" },
        submission: { city: "San Francisco", state: "CA" },
      }),
    ).toEqual({ state: "WA" });
  });

  it("does not select a city overlay when an address explicitly names another supported state", () => {
    expect(resolveJurisdiction({ listingProperty: { address: "123 San Francisco St, Spokane, WA 99201" } })).toEqual({
      state: "WA",
    });
    expect(resolveJurisdiction({ listingProperty: { address: "94105 Market St, Seattle, WA 98101" } })).toEqual({
      state: "WA",
      city: "seattle",
    });
  });

  it("uses a joined city match when state is structured but city is omitted", () => {
    expect(
      resolveJurisdiction({
        listingProperty: { address: "1 Dr Carlton B Goodlett Pl, San Francisco, CA 94102", state: "CA" },
      }),
    ).toEqual({ state: "CA", city: "san_francisco" });
  });

  it("selects the registered state config or verified city overlay", () => {
    expect(jurisdictionConfig({ state: "CA" })).toBe(CALIFORNIA_LEASE_CONFIG);
    expect(jurisdictionConfig({ state: "CA", city: "san_francisco" })).toBe(SAN_FRANCISCO_LEASE_CONFIG);
    expect(jurisdictionConfig({ state: "WA" })).toBe(WASHINGTON_LEASE_CONFIG);
    expect(jurisdictionConfig({ state: "WA", city: "seattle" })).toBe(SEATTLE_LEASE_CONFIG);
  });

  it("maps jurisdiction keys to the disclosure catalog inheritance scopes", () => {
    expect(jurisdictionRuleScopes({ state: "CA", city: "san_francisco" })).toEqual([
      "federal",
      "california",
      "san_francisco",
    ]);
    expect(jurisdictionRuleScopes({ state: "CA" })).toEqual(["federal", "california"]);
    expect(jurisdictionRuleScopes({ state: "WA", city: "seattle" })).toEqual([
      "federal",
      "washington",
      "seattle",
    ]);
    expect(jurisdictionRuleScopes({ state: "WA" })).toEqual(["federal", "washington"]);
  });
});
