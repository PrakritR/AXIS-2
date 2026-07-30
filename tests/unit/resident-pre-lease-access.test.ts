import { describe, expect, it } from "vitest";
import {
  isResidentApplicationPhaseAllowedPath,
  isResidentPreLeaseAllowedPath,
} from "@/lib/resident-portal-route-guard";
import { RESIDENT_PRE_LEASE_PORTAL_SECTIONS } from "@/lib/portals/resident-sections";

describe("pre-lease resident portal access", () => {
  it("pre-lease sections include dashboard, tour, application, communication", () => {
    const ids = RESIDENT_PRE_LEASE_PORTAL_SECTIONS.map((s) => s.section);
    expect(ids).toEqual(["dashboard", "tour", "applications", "communication", "profile"]);
  });

  it("pre-lease route guard allows tour and communication", () => {
    expect(isResidentPreLeaseAllowedPath("/resident/tour")).toBe(true);
    expect(isResidentPreLeaseAllowedPath("/resident/communication/email/unopened")).toBe(true);
    expect(isResidentPreLeaseAllowedPath("/resident/dashboard")).toBe(true);
  });

  it("pre-lease route guard denies lease, payments, documents, services", () => {
    expect(isResidentPreLeaseAllowedPath("/resident/lease")).toBe(false);
    expect(isResidentPreLeaseAllowedPath("/resident/payments")).toBe(false);
    expect(isResidentPreLeaseAllowedPath("/resident/documents/application")).toBe(false);
    expect(isResidentPreLeaseAllowedPath("/resident/services/requests")).toBe(false);
  });

  it("application-phase guard still blocks tour without pre-lease flag", () => {
    expect(isResidentApplicationPhaseAllowedPath("/resident/tour")).toBe(false);
    expect(isResidentApplicationPhaseAllowedPath("/resident/communication/email/unopened")).toBe(false);
  });
});
