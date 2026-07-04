import { describe, expect, it } from "vitest";
import { adjacentPrimarySection, resolveSwipePageDirection } from "@/lib/native/portal-swipe-page";

describe("resolveSwipePageDirection", () => {
  it("detects a leftward swipe past the threshold", () => {
    expect(resolveSwipePageDirection({ startX: 300, startY: 400, endX: 200, endY: 405 })).toBe("left");
  });

  it("detects a rightward swipe past the threshold", () => {
    expect(resolveSwipePageDirection({ startX: 100, startY: 400, endX: 220, endY: 395 })).toBe("right");
  });

  it("ignores a swipe below the distance threshold", () => {
    expect(resolveSwipePageDirection({ startX: 100, startY: 400, endX: 120, endY: 400 })).toBeNull();
  });

  it("ignores a mostly-vertical swipe (scroll gesture)", () => {
    expect(resolveSwipePageDirection({ startX: 100, startY: 700, endX: 140, endY: 400 })).toBeNull();
  });
});

describe("adjacentPrimarySection", () => {
  const order = ["dashboard", "properties", "residents", "documents", "profile"];

  it("advances forward on a left swipe", () => {
    expect(adjacentPrimarySection(order, "properties", "left")).toBe("residents");
  });

  it("goes back on a right swipe", () => {
    expect(adjacentPrimarySection(order, "properties", "right")).toBe("dashboard");
  });

  it("returns null past the last tab", () => {
    expect(adjacentPrimarySection(order, "profile", "left")).toBeNull();
  });

  it("returns null before the first tab", () => {
    expect(adjacentPrimarySection(order, "dashboard", "right")).toBeNull();
  });

  it("returns null when the current section isn't in the order", () => {
    expect(adjacentPrimarySection(order, "financials", "left")).toBeNull();
  });
});
