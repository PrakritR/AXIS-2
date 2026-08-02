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

  it("allows communication during application phase", () => {
    expect(isResidentApplicationPhaseAllowedPath("/resident/communication/inbox/unopened")).toBe(true);
    expect(isResidentApplicationPhaseAllowedPath("/resident/communication/email/unopened")).toBe(true);
  });

  it("allows the application dashboard while blocking lease-only routes", () => {
    expect(isResidentApplicationPhaseAllowedPath("/resident/dashboard")).toBe(true);
    expect(isResidentApplicationPhaseAllowedPath("/resident/lease")).toBe(false);
    expect(isResidentApplicationPhaseAllowedPath("/resident/payments")).toBe(false);
  });

  it("allows dashboard after a completed application submission", () => {
    expect(isResidentApplicationPhaseAllowedPath("/resident/dashboard", { allowDashboard: true })).toBe(true);
  });
});
