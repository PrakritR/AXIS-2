import { describe, expect, it } from "vitest";

import {
  clampFabCenter,
  detectNearestEdge,
  resolveFabPlacementAfterDrag,
  snapFabToEdge,
  swipeTucksOnEdge,
} from "@/lib/axis-assistant/fab-position";

const insets = { top: 0, right: 0, bottom: 0, left: 0 };

describe("fab position helpers", () => {
  it("clamps fab center inside the viewport", () => {
    expect(clampFabCenter(0, 0, 400, 800, insets)).toEqual({ x: 28, y: 28 });
    expect(clampFabCenter(400, 800, 400, 800, insets)).toEqual({ x: 372, y: 772 });
  });

  it("detects the nearest edge within the snap threshold", () => {
    expect(detectNearestEdge(390, 400, 400, 800, insets)).toBe("right");
    expect(detectNearestEdge(10, 400, 400, 800, insets)).toBe("left");
    expect(detectNearestEdge(200, 790, 400, 800, insets)).toBe("bottom");
    expect(detectNearestEdge(200, 10, 400, 800, insets)).toBe("top");
    expect(detectNearestEdge(200, 400, 400, 800, insets)).toBeNull();
  });

  it("snaps placement to an edge while preserving the free axis", () => {
    expect(snapFabToEdge("right", 200, 300, 400, 800, insets)).toEqual({
      x: 352,
      y: 300,
      edge: "right",
    });
    expect(snapFabToEdge("bottom", 200, 300, 400, 800, insets)).toEqual({
      x: 200,
      y: 752,
      edge: "bottom",
    });
  });

  it("keeps free placement when not near an edge", () => {
    expect(resolveFabPlacementAfterDrag(200, 400, 400, 800, insets)).toEqual({
      x: 200,
      y: 400,
      edge: null,
    });
  });

  it("interprets swipe direction per edge", () => {
    expect(swipeTucksOnEdge("right", 40, 0)).toBe(true);
    expect(swipeTucksOnEdge("right", -30, 0)).toBe(false);
    expect(swipeTucksOnEdge("left", -40, 0)).toBe(true);
    expect(swipeTucksOnEdge("bottom", 0, 40)).toBe(true);
    expect(swipeTucksOnEdge("top", 0, -40)).toBe(true);
  });
});
