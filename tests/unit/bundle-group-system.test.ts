import { describe, expect, it } from "vitest";
import {
  buildMemberSplitLines,
  resolveBundleFinancialTotals,
  splitMoneyEvenly,
  splitShareLabel,
} from "@/lib/bundle-group/bundle-cost-split";
import {
  buildBundleApplicationGroups,
  bundleGroupReadyForJointLease,
  validateBundleGroupJoin,
} from "@/lib/bundle-group/bundle-group-application";
import { jointLeasePartiesParagraph, jointLeaseRowIncludesMember } from "@/lib/bundle-group/joint-lease";
import type { LeasePipelineRow } from "@/lib/lease-pipeline-storage";

describe("splitMoneyEvenly", () => {
  it("splits evenly with remainder cents to lowest indices", () => {
    expect(splitMoneyEvenly(100, 3, 0)).toBe(33.34);
    expect(splitMoneyEvenly(100, 3, 1)).toBe(33.33);
    expect(splitMoneyEvenly(100, 3, 2)).toBe(33.33);
    expect(splitMoneyEvenly(900, 3, 0)).toBe(300);
  });

  it("returns full amount for single member", () => {
    expect(splitMoneyEvenly(500, 1, 0)).toBe(500);
  });
});

describe("resolveBundleFinancialTotals", () => {
  it("aggregates bundle rent and utilities from included rooms", () => {
    const sub = {
      v: 1 as const,
      securityDeposit: "$900",
      moveInFee: "$150",
      rooms: [
        { id: "r1", name: "Room 1", monthlyRent: 900, utilitiesEstimate: "$100" },
        { id: "r2", name: "Room 2", monthlyRent: 850, utilitiesEstimate: "$80" },
      ],
      bundles: [
        {
          id: "b1",
          label: "Two rooms",
          price: "$1,700/mo",
          strikethrough: "",
          promo: "",
          roomsLine: "",
          includedRoomIds: ["r1", "r2"],
        },
      ],
      bathrooms: [],
      customLeaseTerms: [],
      customApplicationFields: [],
    };
    const totals = resolveBundleFinancialTotals(sub, "b1");
    expect(totals?.monthlyRent).toBe(1700);
    expect(totals?.securityDeposit).toBe(900);
    expect(totals?.moveInFee).toBe(150);
    expect(totals?.monthlyUtilities).toBe(180);
  });
});

describe("buildMemberSplitLines", () => {
  it("builds per-member share lines", () => {
    const lines = buildMemberSplitLines(
      { monthlyRent: 900, securityDeposit: 900, moveInFee: 0, monthlyUtilities: 180 },
      3,
      0,
    );
    expect(lines.find((l) => l.kind === "rent")?.memberAmount).toBe(300);
    expect(lines.find((l) => l.kind === "security_deposit")?.memberAmount).toBe(300);
    expect(splitShareLabel(0, 3, "$900")).toContain("1/3");
  });
});

describe("bundle group application", () => {
  it("flags bundle mismatch across members", () => {
    const groups = buildBundleApplicationGroups([
      {
        id: "a1",
        name: "A",
        email: "a@test.com",
        role: "first",
        groupId: "PROPLANE-ABC12345",
        groupSize: "2",
        status: "approved",
        bundleId: "b1",
        propertyId: "p1",
      },
      {
        id: "a2",
        name: "B",
        email: "b@test.com",
        role: "joining",
        groupId: "PROPLANE-ABC12345",
        groupSize: "",
        status: "approved",
        bundleId: "b2",
        propertyId: "p1",
      },
    ]);
    const group = groups.get("PROPLANE-ABC12345");
    expect(group?.bundleMismatch).toBe(true);
    expect(bundleGroupReadyForJointLease(group!)).toBe(false);
  });

  it("validates joiner bundle matches organizer", () => {
    expect(
      validateBundleGroupJoin(
        { propertyId: "p1", bundleId: "b1", groupId: "PROPLANE-ABC12345" },
        { propertyId: "p1", bundleId: "b2", groupId: "PROPLANE-ABC12345" },
      ),
    ).toMatch(/bundle must match/i);
  });
});

describe("jointLeaseRowIncludesMember", () => {
  const jointRow = {
    leaseKind: "joint_bundle",
    residentEmail: "organizer@test.com",
    axisId: "app-org",
    jointLeaseMembers: [
      {
        applicationId: "app-org",
        residentEmail: "organizer@test.com",
        residentName: "Organizer",
        residentUserId: null,
        role: "first",
      },
      {
        applicationId: "app-join",
        residentEmail: "joiner@test.com",
        residentName: "Joiner",
        residentUserId: null,
        role: "joining",
      },
    ],
  } satisfies Pick<LeasePipelineRow, "leaseKind" | "jointLeaseMembers" | "residentEmail" | "axisId">;

  it("matches joint bundle members by email", () => {
    expect(jointLeaseRowIncludesMember(jointRow, { email: "joiner@test.com" })).toBe(true);
    expect(jointLeaseRowIncludesMember(jointRow, { email: "stranger@test.com" })).toBe(false);
  });

  it("matches individual rows by email or application id", () => {
    const individual = {
      leaseKind: "individual",
      residentEmail: "solo@test.com",
      axisId: "app-solo",
    } satisfies Pick<LeasePipelineRow, "leaseKind" | "jointLeaseMembers" | "residentEmail" | "axisId">;
    expect(jointLeaseRowIncludesMember(individual, { email: "solo@test.com" })).toBe(true);
    expect(jointLeaseRowIncludesMember(individual, { applicationId: "app-solo" })).toBe(true);
  });
});

describe("joint lease copy", () => {
  it("lists all co-tenants", () => {
    const html = jointLeasePartiesParagraph([
      { applicationId: "1", residentName: "Alex Kim", residentEmail: "a@test.com", residentUserId: null, role: "first" },
      { applicationId: "2", residentName: "Jordan Lee", residentEmail: "b@test.com", residentUserId: null, role: "joining" },
    ]);
    expect(html).toContain("Alex Kim");
    expect(html).toContain("Jordan Lee");
    expect(html).toContain("joint and several");
  });
});
