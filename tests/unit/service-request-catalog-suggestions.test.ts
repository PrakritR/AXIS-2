import { describe, expect, it } from "vitest";
import { missingServiceRequestPresets } from "@/components/portal/service-request-catalog-suggestions";
import { LISTING_SERVICE_QUICK_ADDS } from "@/lib/manager-listing-submission";

describe("missingServiceRequestPresets", () => {
  it("returns all presets when the property has no offerings", () => {
    expect(missingServiceRequestPresets([])).toEqual(LISTING_SERVICE_QUICK_ADDS);
  });

  it("excludes presets already on the property (case-insensitive name match)", () => {
    const locker = LISTING_SERVICE_QUICK_ADDS.find((p) => p.name === "Storage locker")!;
    const missing = missingServiceRequestPresets([
      {
        id: "svc-1",
        name: ` ${locker.name} `,
        description: "",
        price: "",
        deposit: "",
        available: true,
      },
    ]);
    expect(missing.some((p) => p.name === locker.name)).toBe(false);
    expect(missing.length).toBe(LISTING_SERVICE_QUICK_ADDS.length - 1);
  });
});
