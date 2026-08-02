import { describe, expect, it } from "vitest";
import { isResidentPathAllowedForAccess } from "@/lib/resident-portal-nav";
import { RESIDENT_UNIFIED_PORTAL_SECTIONS } from "@/lib/portals/resident-sections";

describe("resident portal stage access", () => {
  const preApproval = { leaseAccessUnlocked: false, applicationApproved: false, hasSubmittedApplication: false };
  const postApproval = { leaseAccessUnlocked: false, applicationApproved: true, hasSubmittedApplication: true };
  const postLease = { leaseAccessUnlocked: true, applicationApproved: true, hasSubmittedApplication: true };

  it("unified nav catalog lists every resident section", () => {
    const ids = RESIDENT_UNIFIED_PORTAL_SECTIONS.map((s) => s.section);
    expect(ids).toContain("tour");
    expect(ids).toContain("lease");
    expect(ids).toContain("services");
    expect(ids).toContain("payments");
  });

  it("pre-approval allows tour, application, dashboard, and communication", () => {
    expect(isResidentPathAllowedForAccess("/resident/tour", preApproval)).toBe(true);
    expect(isResidentPathAllowedForAccess("/resident/applications/pending", preApproval)).toBe(true);
    expect(isResidentPathAllowedForAccess("/resident/dashboard", preApproval)).toBe(true);
    expect(isResidentPathAllowedForAccess("/resident/communication/inbox/unopened", preApproval)).toBe(true);
    expect(isResidentPathAllowedForAccess("/resident/lease", preApproval)).toBe(false);
    expect(isResidentPathAllowedForAccess("/resident/payments/pending", preApproval)).toBe(false);
  });

  it("post-approval allows lease, payments, tour, and application", () => {
    expect(isResidentPathAllowedForAccess("/resident/lease", postApproval)).toBe(true);
    expect(isResidentPathAllowedForAccess("/resident/payments/pending", postApproval)).toBe(true);
    expect(isResidentPathAllowedForAccess("/resident/tour", postApproval)).toBe(true);
    expect(isResidentPathAllowedForAccess("/resident/applications/pending", postApproval)).toBe(true);
    expect(isResidentPathAllowedForAccess("/resident/applications/apply?propertyId=demo", postApproval)).toBe(true);
    expect(isResidentPathAllowedForAccess("/resident/services/requests", postApproval)).toBe(false);
  });

  it("post-lease unlocks services and keeps tour and application reachable", () => {
    expect(isResidentPathAllowedForAccess("/resident/services/requests", postLease)).toBe(true);
    expect(isResidentPathAllowedForAccess("/resident/lease", postLease)).toBe(true);
    expect(isResidentPathAllowedForAccess("/resident/tour", postLease)).toBe(true);
    expect(isResidentPathAllowedForAccess("/resident/applications/pending", postLease)).toBe(true);
  });
});
