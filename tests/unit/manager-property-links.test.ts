import { describe, expect, it } from "vitest";
import { buildManagerApplyUrl, buildManagerTourUrl, buildTourContactHref } from "@/lib/manager-property-links";

describe("manager-property-links", () => {
  const origin = "https://app.example.com";

  it("builds apply URL with property and optional room params", () => {
    const url = buildManagerApplyUrl(origin, {
      propertyId: "mgr-42",
      listingRoomId: "room-a",
      roomName: "Room 2A",
    });
    expect(url).toBe(
      "https://app.example.com/rent/apply?propertyId=mgr-42&listingRoomId=room-a&roomName=Room+2A",
    );
  });

  it("builds apply URL without room when omitted", () => {
    const url = buildManagerApplyUrl(origin, { propertyId: "mgr-42" });
    expect(url).toBe("https://app.example.com/rent/apply?propertyId=mgr-42");
  });

  it("builds relative tour contact href with encoded property id", () => {
    expect(buildTourContactHref("mgr house 1")).toBe("/rent/tours-contact?propertyId=mgr%20house%201");
  });

  it("builds tour URL with encoded property id", () => {
    const url = buildManagerTourUrl(origin, "mgr house 1");
    expect(url).toBe("https://app.example.com/rent/tours-contact?propertyId=mgr%20house%201");
  });

  it("strips trailing slash from origin", () => {
    const url = buildManagerTourUrl("https://app.example.com/", "mgr-1");
    expect(url).toBe("https://app.example.com/rent/tours-contact?propertyId=mgr-1");
  });
});
