import { describe, expect, it } from "vitest";
import {
  buildManagerApplyUrl,
  buildManagerBrowseUrl,
  buildManagerTourUrl,
  buildPropertyMessageHref,
  buildTourContactHref,
  parseBrowseIdsParam,
} from "@/lib/manager-property-links";

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
    expect(buildTourContactHref("mgr house 1")).toBe("/rent/tours-contact?propertyId=mgr+house+1");
  });

  it("builds message contact href with message tab", () => {
    expect(buildPropertyMessageHref("mgr house 1")).toBe(
      "/rent/tours-contact?propertyId=mgr+house+1&tab=message",
    );
  });

  it("builds tour contact href with optional next path", () => {
    expect(buildTourContactHref("mgr-1", { next: "/rent/apply?propertyId=mgr-1" })).toBe(
      "/rent/tours-contact?propertyId=mgr-1&next=%2Frent%2Fapply%3FpropertyId%3Dmgr-1",
    );
  });

  it("builds tour URL with encoded property id", () => {
    const url = buildManagerTourUrl(origin, "mgr house 1");
    expect(url).toBe("https://app.example.com/rent/tours-contact?propertyId=mgr+house+1");
  });

  it("strips trailing slash from origin", () => {
    const url = buildManagerTourUrl("https://app.example.com/", "mgr-1");
    expect(url).toBe("https://app.example.com/rent/tours-contact?propertyId=mgr-1");
  });

  it("builds a browse link pre-filtered to a set of listing ids", () => {
    const url = buildManagerBrowseUrl(origin, ["mgr-1", "mgr-2", "mgr-3"]);
    expect(url).toBe("https://app.example.com/rent/browse?ids=mgr-1%2Cmgr-2%2Cmgr-3");
  });

  it("dedupes and trims ids in the browse link, dropping blanks", () => {
    const url = buildManagerBrowseUrl(origin, [" mgr-1 ", "mgr-2", "mgr-1", ""]);
    expect(url).toBe("https://app.example.com/rent/browse?ids=mgr-1%2Cmgr-2");
  });

  it("falls back to the plain browse page when no ids are given", () => {
    expect(buildManagerBrowseUrl(origin, [])).toBe("https://app.example.com/rent/browse");
  });

  it("round-trips ids through parseBrowseIdsParam", () => {
    expect(parseBrowseIdsParam("mgr-1,mgr-2,mgr-1, ,mgr-3")).toEqual(["mgr-1", "mgr-2", "mgr-3"]);
    expect(parseBrowseIdsParam("")).toEqual([]);
    expect(parseBrowseIdsParam(null)).toEqual([]);
  });
});
