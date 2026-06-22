import { describe, expect, it } from "vitest";
import { pruneSharedSpaceAmenitiesForKind, sharedSpaceAmenityPresetsForKind } from "@/data/manager-listing-presets";

describe("sharedSpaceAmenityPresetsForKind", () => {
  it("returns kitchen presets for kitchen spaces", () => {
    const presets = sharedSpaceAmenityPresetsForKind("kitchen");
    expect(presets.map((p) => p.id)).toContain("dishwasher");
    expect(presets.map((p) => p.id)).not.toContain("washer-dryer");
  });

  it("returns laundry presets for laundry spaces", () => {
    const presets = sharedSpaceAmenityPresetsForKind("laundry");
    expect(presets.map((p) => p.id)).toEqual(expect.arrayContaining(["washer-dryer", "laundry-sink"]));
    expect(presets.map((p) => p.id)).not.toContain("dishwasher");
  });

  it("prunes amenities when space type changes", () => {
    const pruned = pruneSharedSpaceAmenitiesForKind("Microwave\nWasher / dryer", "kitchen");
    expect(pruned).toBe("Microwave");
  });
});
