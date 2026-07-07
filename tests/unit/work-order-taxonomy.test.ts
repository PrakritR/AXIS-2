import { describe, expect, it } from "vitest";
import {
  categoriesForVendorTrade,
  categoriesForVendorTrades,
  vendorCapabilitiesMatchCategory,
  vendorTradeMatchesCategory,
  workOrderCategoryForResidentLabel,
} from "@/lib/work-order-taxonomy";

describe("workOrderCategoryForResidentLabel", () => {
  it("maps every resident picklist label to its canonical category", () => {
    expect(workOrderCategoryForResidentLabel("Plumbing")).toBe("plumbing");
    expect(workOrderCategoryForResidentLabel("Electrical")).toBe("electrical");
    expect(workOrderCategoryForResidentLabel("HVAC")).toBe("hvac");
    expect(workOrderCategoryForResidentLabel("Appliance")).toBe("appliance");
    expect(workOrderCategoryForResidentLabel("Access / Locks")).toBe("access");
    expect(workOrderCategoryForResidentLabel("General")).toBe("general");
  });

  it("falls back to general for an unrecognized label", () => {
    expect(workOrderCategoryForResidentLabel("Something else")).toBe("general");
  });
});

describe("categoriesForVendorTrade / vendorTradeMatchesCategory", () => {
  it("maps trades with a clear category counterpart", () => {
    expect(categoriesForVendorTrade("Plumbing")).toEqual(["plumbing"]);
    expect(categoriesForVendorTrade("Electrical")).toEqual(["electrical"]);
    expect(categoriesForVendorTrade("HVAC")).toEqual(["hvac"]);
    expect(categoriesForVendorTrade("Appliance repair")).toEqual(["appliance"]);
    expect(categoriesForVendorTrade("Cleaning")).toEqual(["cleaning"]);
  });

  it("maps a general maintenance vendor to the miscellaneous categories", () => {
    expect(categoriesForVendorTrade("General maintenance")).toEqual(["general", "appliance", "access"]);
  });

  it("maps trades with no reliable category counterpart to an empty list", () => {
    expect(categoriesForVendorTrade("Landscaping")).toEqual([]);
    expect(categoriesForVendorTrade("Pest control")).toEqual([]);
    expect(categoriesForVendorTrade("Other")).toEqual([]);
  });

  it("returns an empty list for an unknown trade string", () => {
    expect(categoriesForVendorTrade("Roofing")).toEqual([]);
  });

  it("vendorTradeMatchesCategory agrees with categoriesForVendorTrade", () => {
    expect(vendorTradeMatchesCategory("Plumbing", "plumbing")).toBe(true);
    expect(vendorTradeMatchesCategory("Plumbing", "electrical")).toBe(false);
    expect(vendorTradeMatchesCategory("General maintenance", "access")).toBe(true);
    expect(vendorTradeMatchesCategory("Landscaping", "general")).toBe(false);
  });
});

describe("categoriesForVendorTrades / vendorCapabilitiesMatchCategory (multi-capability vendors)", () => {
  it("unions categories across all of a vendor's selected trades", () => {
    expect(categoriesForVendorTrades(["Plumbing", "Electrical"])).toEqual(
      expect.arrayContaining(["plumbing", "electrical"]),
    );
    expect(categoriesForVendorTrades(["Plumbing", "Electrical"])).toHaveLength(2);
  });

  it("dedupes overlapping categories from different trades", () => {
    expect(categoriesForVendorTrades(["General maintenance", "Appliance repair"])).toEqual(
      expect.arrayContaining(["general", "appliance", "access"]),
    );
    expect(categoriesForVendorTrades(["General maintenance", "Appliance repair"])).toHaveLength(3);
  });

  it("matches when any selected trade services the category", () => {
    expect(vendorCapabilitiesMatchCategory(["Plumbing", "Electrical"], "electrical")).toBe(true);
    expect(vendorCapabilitiesMatchCategory(["Plumbing", "Electrical"], "hvac")).toBe(false);
  });

  it("returns false for an empty capability list", () => {
    expect(vendorCapabilitiesMatchCategory([], "plumbing")).toBe(false);
    expect(categoriesForVendorTrades([])).toEqual([]);
  });
});
