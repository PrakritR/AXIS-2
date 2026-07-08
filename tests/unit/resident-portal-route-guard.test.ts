import { describe, expect, it } from "vitest";
import { isResidentApplicationPhaseAllowedPath } from "@/lib/resident-portal-route-guard";

describe("resident application-phase route guard", () => {
  it("allows applications home and apply wizard", () => {
    expect(isResidentApplicationPhaseAllowedPath("/resident/applications")).toBe(true);
    expect(isResidentApplicationPhaseAllowedPath("/resident/applications/apply")).toBe(true);
    expect(isResidentApplicationPhaseAllowedPath("/resident/applications/apply?propertyId=x")).toBe(true);
  });

  it("allows settings during application phase", () => {
    expect(isResidentApplicationPhaseAllowedPath("/resident/profile")).toBe(true);
  });

  it("blocks other resident routes", () => {
    expect(isResidentApplicationPhaseAllowedPath("/resident/dashboard")).toBe(false);
    expect(isResidentApplicationPhaseAllowedPath("/resident/lease")).toBe(false);
  });

  it("allows dashboard after a completed application submission", () => {
    expect(isResidentApplicationPhaseAllowedPath("/resident/dashboard", { allowDashboard: true })).toBe(true);
  });
});
