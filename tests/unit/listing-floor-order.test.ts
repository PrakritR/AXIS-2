import { describe, expect, it } from "vitest";
import {
  compareFloorLabels,
  compareListingRoomMediaEntries,
  compareRoomsByFloorThenName,
  floorLabelSortRank,
  sortRoomIndicesByFloor,
  sortUniqueFloorLabels,
} from "@/lib/listing-floor-order";

describe("listing-floor-order", () => {
  it("ranks floors low to high", () => {
    expect(floorLabelSortRank("Basement / garden level")).toBeLessThan(floorLabelSortRank("1st / main floor"));
    expect(floorLabelSortRank("1st / main floor")).toBeLessThan(floorLabelSortRank("2nd floor"));
    expect(floorLabelSortRank("2nd floor")).toBeLessThan(floorLabelSortRank("3rd floor"));
    expect(floorLabelSortRank("3rd floor")).toBeLessThan(floorLabelSortRank("Loft / attic"));
  });

  it("sorts unique floor labels", () => {
    expect(sortUniqueFloorLabels(["3rd floor", "1st / main floor", "2nd floor"])).toEqual([
      "1st / main floor",
      "2nd floor",
      "3rd floor",
    ]);
  });

  it("sorts listing media entries by room number across floor groups", () => {
    const entries = [
      { room: { name: "Room 5" }, floorLabel: "1st / main floor" },
      { room: { name: "Room 3" }, floorLabel: "Floor plan" },
      { room: { name: "Room 4" }, floorLabel: "Floor plan" },
      { room: { name: "Room 1" }, floorLabel: "Floor plan" },
      { room: { name: "Room 2" }, floorLabel: "Floor plan" },
    ];
    const sorted = [...entries].sort(compareListingRoomMediaEntries).map((e) => e.room.name);
    expect(sorted).toEqual(["Room 1", "Room 2", "Room 3", "Room 4", "Room 5"]);
  });

  it("sorts room indices by floor then room number", () => {
    const rooms = [
      { id: "a", name: "Room 8", floor: "3rd floor" },
      { id: "b", name: "Room 9", floor: "1st / main floor" },
      { id: "c", name: "Room 5", floor: "3rd floor" },
      { id: "d", name: "Room 1", floor: "2nd floor" },
    ];
    expect(sortRoomIndicesByFloor(rooms)).toEqual([1, 3, 2, 0]);
    expect(compareRoomsByFloorThenName(rooms[1]!, rooms[0]!)).toBeLessThan(0);
    expect(compareFloorLabels("1st / main floor", "3rd floor")).toBeLessThan(0);
  });
});
