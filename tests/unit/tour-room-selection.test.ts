import { describe, expect, it } from "vitest";
import {
  TOUR_ROOM_UNDECIDED_KEY,
  TOUR_ROOM_UNDECIDED_LABEL,
  isTourRoomUndecided,
} from "@/app/(public)/rent/tours-contact/page";

describe("tour room selection", () => {
  it("recognizes the undecided sentinel key", () => {
    expect(isTourRoomUndecided(TOUR_ROOM_UNDECIDED_KEY)).toBe(true);
    expect(isTourRoomUndecided("prop::room-1")).toBe(false);
    expect(isTourRoomUndecided(null)).toBe(false);
  });

  it("exports a renter-facing undecided label", () => {
    expect(TOUR_ROOM_UNDECIDED_LABEL).toMatch(/not sure/i);
  });
});
