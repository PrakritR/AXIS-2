import { describe, expect, it } from "vitest";
import {
  isResidentPathAllowedForAccess,
  resolveResidentPortalNavStage,
  residentBottomNavPrimarySections,
  residentSectionLockedForStage,
  residentSectionUnlockedForStage,
} from "@/lib/resident-portal-nav";

describe("resident portal nav stages", () => {
  const preApproval = { leaseAccessUnlocked: false, applicationApproved: false, hasSubmittedApplication: false };
  const postApproval = { leaseAccessUnlocked: false, applicationApproved: true, hasSubmittedApplication: true };
  const postLease = { leaseAccessUnlocked: true, applicationApproved: true, hasSubmittedApplication: true };

  it("resolves stages from access flags", () => {
    expect(resolveResidentPortalNavStage(preApproval)).toBe("pre_approval");
    expect(resolveResidentPortalNavStage(postApproval)).toBe("post_approval_pre_lease");
    expect(resolveResidentPortalNavStage(postLease)).toBe("post_lease");
  });

  it("pre-approval bottom bar is tour, application, dashboard, communication", () => {
    expect(residentBottomNavPrimarySections("pre_approval")).toEqual([
      "tour",
      "applications",
      "dashboard",
      "communication",
    ]);
  });

  it("post-approval bottom bar is lease, payments, dashboard, communication", () => {
    expect(residentBottomNavPrimarySections("post_approval_pre_lease")).toEqual([
      "lease",
      "payments",
      "dashboard",
      "communication",
    ]);
  });

  it("post-lease bottom bar is services, payments, dashboard, communication", () => {
    expect(residentBottomNavPrimarySections("post_lease")).toEqual([
      "services",
      "payments",
      "dashboard",
      "communication",
    ]);
  });

  it("allows communication during pre-approval", () => {
    expect(isResidentPathAllowedForAccess("/resident/communication/inbox/unopened", preApproval)).toBe(true);
  });

  it("keeps tour and application reachable after approval and post-lease", () => {
    expect(residentSectionLockedForStage("tour", "post_approval_pre_lease")).toBe(false);
    expect(residentSectionLockedForStage("applications", "post_approval_pre_lease")).toBe(false);
    expect(residentSectionUnlockedForStage("lease", "post_approval_pre_lease")).toBe(true);
    expect(residentSectionUnlockedForStage("payments", "post_approval_pre_lease")).toBe(true);
    expect(residentSectionLockedForStage("tour", "post_lease")).toBe(false);
    expect(residentSectionLockedForStage("applications", "post_lease")).toBe(false);
  });

  it("keeps lease unlocked after both parties sign", () => {
    expect(residentSectionUnlockedForStage("lease", "post_lease")).toBe(true);
    expect(residentSectionUnlockedForStage("services", "post_lease")).toBe(true);
  });
});
