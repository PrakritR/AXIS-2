import { describe, expect, it } from "vitest";
import {
  scoreRoomMedia,
  shouldWarnOnPublish,
  summarizePropertyMediaReadiness,
} from "@/lib/listing-room-media-quality";
import type { ManagerRoomSubmission } from "@/lib/manager-listing-submission";

function room(overrides: Partial<ManagerRoomSubmission>): ManagerRoomSubmission {
  return {
    id: overrides.id ?? "r1",
    name: overrides.name ?? "Room 1",
    floor: "",
    monthlyRent: overrides.monthlyRent ?? 800,
    availability: "Available now",
    moveInAvailableDate: "",
    moveInInstructions: "",
    detail: "",
    furnishing: "",
    roomAmenitiesText: "",
    utilitiesEstimate: "",
    photoDataUrls: [],
    videoDataUrl: null,
    manualUnavailableRanges: [],
    ...overrides,
  };
}

describe("scoreRoomMedia", () => {
  it("marks empty media incomplete", () => {
    expect(scoreRoomMedia({}).tier).toBe("incomplete");
  });

  it("awards bronze for one photo or video", () => {
    expect(scoreRoomMedia({ photoDataUrls: ["https://x/a.jpg"] }).tier).toBe("bronze");
    expect(scoreRoomMedia({ videoDataUrl: "https://x/v.mp4" }).tier).toBe("bronze");
  });

  it("awards silver for three photos", () => {
    expect(
      scoreRoomMedia({ photoDataUrls: ["a", "b", "c"] }).tier,
    ).toBe("silver");
  });

  it("awards gold for three photos and video", () => {
    expect(
      scoreRoomMedia({ photoDataUrls: ["a", "b", "c"], videoDataUrl: "v" }).tier,
    ).toBe("gold");
  });
});

describe("summarizePropertyMediaReadiness", () => {
  it("counts only listed rooms and warns below threshold", () => {
    const readiness = summarizePropertyMediaReadiness([
      room({ id: "a", photoDataUrls: ["p"] }),
      room({ id: "b", name: "", monthlyRent: 0 }),
      room({ id: "c" }),
      room({ id: "d", photoDataUrls: ["p"] }),
    ]);
    expect(readiness.listedCount).toBe(3);
    expect(readiness.readyCount).toBe(2);
    expect(shouldWarnOnPublish(readiness)).toBe(true);
  });

  it("does not warn when seventy percent or more are ready", () => {
    const readiness = summarizePropertyMediaReadiness([
      room({ id: "a", photoDataUrls: ["p"] }),
      room({ id: "b", photoDataUrls: ["p"] }),
      room({ id: "c", photoDataUrls: ["p"] }),
      room({ id: "d" }),
    ]);
    expect(readiness.readyCount).toBe(3);
    expect(shouldWarnOnPublish(readiness)).toBe(false);
  });
});
