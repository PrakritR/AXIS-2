import { describe, expect, it } from "vitest";
import {
  filterSandboxFromPublicCatalog,
  isSandboxDemoPropertyAddress,
  isSandboxPublicListing,
  isSandboxSeedPropertyId,
} from "@/lib/public-sandbox-listings";

describe("public-sandbox-listings", () => {
  it("flags seeded workflow property ids", () => {
    expect(isSandboxSeedPropertyId("prodseed_prop-magnolia")).toBe(true);
    expect(isSandboxSeedPropertyId("seedwf_prop-birch")).toBe(true);
    expect(isSandboxSeedPropertyId("demo_property_1")).toBe(true);
    expect(isSandboxSeedPropertyId("mgr-seed-4709a-8th-ave-ne")).toBe(false);
  });

  it("flags explicit demo test street addresses", () => {
    expect(isSandboxDemoPropertyAddress("123 Demo Test St, Seattle, WA")).toBe(true);
    expect(isSandboxDemoPropertyAddress("4709A 8th Ave NE, Seattle, WA")).toBe(false);
  });

  it("flags listings owned by sandbox manager emails", () => {
    expect(
      isSandboxPublicListing({
        property: { id: "custom-id", address: "100 Main St, Seattle, WA", managerUserId: "u1" },
        managerEmail: "alex.morgan@axis.local",
      }),
    ).toBe(true);
    expect(
      isSandboxPublicListing({
        property: { id: "custom-id", address: "100 Main St, Seattle, WA", managerUserId: "u1" },
        managerEmail: "admin@axis-seattle-housing.com",
      }),
    ).toBe(false);
  });

  it("filters sandbox listings from production catalog only", () => {
    const listings = [
      { id: "real-1", address: "4709A 8th Ave NE, Seattle, WA", managerUserId: "real" },
      { id: "prodseed_prop-magnolia", address: "1420 Magnolia Ave, Seattle, WA", managerUserId: "demo" },
      { id: "qa-1", address: "123 Demo Test St, Seattle, WA", managerUserId: "qa" },
    ];
    const managerEmailByUserId = new Map([
      ["real", "admin@axis-seattle-housing.com"],
      ["demo", "alex.morgan@axis.local"],
      ["qa", "someone@gmail.com"],
    ]);

    expect(
      filterSandboxFromPublicCatalog(listings, { production: false, managerEmailByUserId }).map((p) => p.id),
    ).toEqual(["real-1", "prodseed_prop-magnolia", "qa-1"]);

    expect(
      filterSandboxFromPublicCatalog(listings, { production: true, managerEmailByUserId }).map((p) => p.id),
    ).toEqual(["real-1"]);
  });
});
