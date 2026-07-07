import { describe, expect, it } from "vitest";
import {
  managerOwnsCatalogVendor,
  searchAxisVendorCatalog,
  vendorCatalogEntryMatchesQuery,
} from "@/lib/axis-vendor-catalog";

describe("axis-vendor-catalog", () => {
  it("finds vendors by ZIP code", () => {
    expect(searchAxisVendorCatalog("98033").map((v) => v.name)).toEqual(["Northwest Appliance Repair"]);
    expect(searchAxisVendorCatalog("98122").map((v) => v.name)).toEqual(["Harbor Pest Response"]);
  });

  it("matches shared vendor fields including notes with embedded zip", () => {
    expect(
      vendorCatalogEntryMatchesQuery(
        { name: "Acme Co", trade: "Plumbing", notes: "Serves 98115" },
        "98115",
      ),
    ).toBe(true);
  });

  it("hides vendors already on the manager account", () => {
    const own = [{ name: "Harbor Pest Response", trade: "Pest control" }];
    expect(managerOwnsCatalogVendor(own, "Harbor Pest Response", "Pest control")).toBe(true);
    const visible = searchAxisVendorCatalog("").filter(
      (row) => !managerOwnsCatalogVendor(own, row.name, row.trade),
    );
    expect(visible.some((row) => row.name === "Harbor Pest Response")).toBe(false);
    expect(visible.length).toBeGreaterThan(0);
  });
});
