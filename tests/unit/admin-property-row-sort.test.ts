import { describe, expect, it } from "vitest";
import {
  compareAdminPropertyRowsForDisplay,
  sortAdminPropertyRowsForDisplay,
  type AdminPropertyRow,
} from "@/lib/demo-admin-property-inventory";

function row(partial: Partial<AdminPropertyRow> & { adminRefId: string }): AdminPropertyRow {
  return {
    buildingName: "",
    unitLabel: "",
    address: "",
    zip: "",
    neighborhood: "",
    beds: 0,
    baths: 0,
    monthlyRent: 0,
    petFriendly: false,
    tagline: "",
    ...partial,
  };
}

describe("admin property row display sort", () => {
  it("orders alphabetically by building name regardless of input order", () => {
    const shuffled = [
      row({ adminRefId: "c", buildingName: "Paseo House", address: "41932 Paseo" }),
      row({ adminRefId: "a", buildingName: "5257 Brooklyn", address: "5257 Brooklyn Ave" }),
      row({ adminRefId: "b", buildingName: "Meadow Brook Village", address: "3655 Birchwood" }),
    ];
    expect(sortAdminPropertyRowsForDisplay(shuffled).map((r) => r.buildingName)).toEqual([
      "5257 Brooklyn",
      "Meadow Brook Village",
      "Paseo House",
    ]);
  });

  it("is stable when the same rows are re-sorted after a shuffle", () => {
    const base = [
      row({ adminRefId: "1", buildingName: "Alpha", listingId: "mgr-alpha" }),
      row({ adminRefId: "2", buildingName: "Beta", listingId: "mgr-beta" }),
      row({ adminRefId: "3", buildingName: "Gamma", listingId: "mgr-gamma" }),
    ];
    const first = sortAdminPropertyRowsForDisplay(base);
    const reshuffled = [base[2]!, base[0]!, base[1]!];
    const second = sortAdminPropertyRowsForDisplay(reshuffled);
    expect(second.map((r) => r.listingId)).toEqual(first.map((r) => r.listingId));
    expect(compareAdminPropertyRowsForDisplay(first[0]!, first[1]!)).toBeLessThan(0);
  });
});
