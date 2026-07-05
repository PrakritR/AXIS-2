import { describe, expect, it } from "vitest";
import { isResidentPreApplicationAllowedPath } from "@/lib/resident-portal-route-guard";

describe("resident pre-application route guard", () => {
  it("allows applications home and apply wizard", () => {
    expect(isResidentPreApplicationAllowedPath("/resident/applications")).toBe(true);
    expect(isResidentPreApplicationAllowedPath("/resident/applications/apply")).toBe(true);
    expect(isResidentPreApplicationAllowedPath("/resident/applications/apply?propertyId=x")).toBe(true);
  });

  it("blocks other resident routes", () => {
    expect(isResidentPreApplicationAllowedPath("/resident/dashboard")).toBe(false);
    expect(isResidentPreApplicationAllowedPath("/resident/lease")).toBe(false);
  });
});
