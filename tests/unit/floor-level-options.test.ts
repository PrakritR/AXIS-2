import { describe, expect, it } from "vitest";
import {
  clampFloorLabelToStories,
  floorLevelLabelsFromStories,
  floorLevelSelectOptions,
} from "@/data/manager-listing-presets";

describe("floor/level options derived from the Floors count", () => {
  it("derives numbered floors only — no Basement/Loft/Outdoor/Custom", () => {
    expect(floorLevelLabelsFromStories("1")).toEqual(["1st floor"]);
    expect(floorLevelLabelsFromStories("2")).toEqual(["1st floor", "2nd floor"]);
    expect(floorLevelLabelsFromStories("3")).toEqual(["1st floor", "2nd floor", "3rd floor"]);
    expect(floorLevelLabelsFromStories("4")).toEqual(["1st floor", "2nd floor", "3rd floor", "4th floor or higher"]);
    // Split level → Lower/Upper (my choice for a split home).
    expect(floorLevelLabelsFromStories("split")).toEqual(["Lower level", "Upper level"]);
    // None of the removed values appears anywhere.
    for (const id of ["1", "2", "3", "4", "split", undefined]) {
      const labels = floorLevelLabelsFromStories(id).join("|").toLowerCase();
      expect(labels).not.toMatch(/basement|garden|loft|attic|outdoor|custom/);
    }
  });

  it("never renders an empty dropdown when floors are not set — offers at least 1st floor", () => {
    expect(floorLevelLabelsFromStories(undefined)).toEqual(["1st floor"]);
    expect(floorLevelLabelsFromStories("")).toEqual(["1st floor"]);
  });

  it("keeps a legacy/out-of-range stored value in the option list so it still displays", () => {
    // An old listing stored "Basement / garden level" — preserved, not blanked.
    expect(floorLevelSelectOptions("2", "Basement / garden level")).toEqual([
      "1st floor",
      "2nd floor",
      "Basement / garden level",
    ]);
    // A value already in the derived list is not duplicated.
    expect(floorLevelSelectOptions("2", "1st floor")).toEqual(["1st floor", "2nd floor"]);
  });

  it("clamps a numbered floor that no longer exists to the highest floor, and reports the change", () => {
    // 3rd floor assigned, then Floors reduced to 2 → clamp to 2nd floor, changed.
    expect(clampFloorLabelToStories("3rd floor", "2")).toEqual({ floor: "2nd floor", changed: true });
    // Still in range → unchanged.
    expect(clampFloorLabelToStories("2nd floor", "2")).toEqual({ floor: "2nd floor", changed: false });
    // Legacy/non-numbered value is preserved untouched (never silently corrupted).
    expect(clampFloorLabelToStories("Basement / garden level", "2")).toEqual({
      floor: "Basement / garden level",
      changed: false,
    });
  });
});
