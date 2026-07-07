import { describe, expect, it } from "vitest";
import { createDefaultListingSubmission } from "@/lib/manager-listing-submission";
import {
  describeRoomBathroomSituation,
  roomBathroomModalLabel,
  roomBathroomSetupLine,
} from "@/lib/listing-bathroom-layout";

describe("listing bathroom layout copy", () => {
  it("labels a private en-suite bathroom", () => {
    const sub = createDefaultListingSubmission();
    sub.rooms = [
      { ...sub.rooms[0]!, id: "r1", name: "Room A", floor: "2nd floor" },
      { ...sub.rooms[0]!, id: "r2", name: "Room B", floor: "2nd floor" },
    ];
    sub.bathrooms = [
      {
        id: "b1",
        name: "Suite bath",
        location: "2nd floor",
        amenitiesText: "",
        photoDataUrls: [],
        shower: true,
        toilet: true,
        bathtub: false,
        assignedRoomIds: ["r1"],
        accessKindByRoomId: { r1: "ensuite" },
      },
    ];

    const room = sub.rooms[0]!;
    expect(roomBathroomModalLabel(room, sub)).toBe("En suite");
    expect(roomBathroomSetupLine(room, sub)).toContain("private bathroom");
    expect(describeRoomBathroomSituation(room.id, sub)).toContain("En suite");
  });

  it("labels a shared bathroom with roommate names in the detail line", () => {
    const sub = createDefaultListingSubmission();
    sub.rooms = [
      { ...sub.rooms[0]!, id: "r1", name: "Room A" },
      { ...sub.rooms[0]!, id: "r2", name: "Room B" },
    ];
    sub.bathrooms = [
      {
        id: "b1",
        name: "Hall bath",
        location: "",
        amenitiesText: "",
        photoDataUrls: [],
        shower: true,
        toilet: true,
        bathtub: false,
        assignedRoomIds: ["r1", "r2"],
        accessKindByRoomId: { r1: "shared", r2: "shared" },
      },
    ];

    const room = sub.rooms[0]!;
    expect(roomBathroomModalLabel(room, sub)).toBe("Shared bathroom");
    expect(roomBathroomSetupLine(room, sub)).toContain("Room B");
    expect(describeRoomBathroomSituation(room.id, sub)).toContain("shared with Room B");
  });
});
