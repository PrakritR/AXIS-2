import { describe, expect, it } from "vitest";
import {
  buildGroupApplyPath,
  groupLeaderInviteFormPatch,
  parseGroupLeaderAppIdParam,
} from "@/lib/rental-application/group-apply-link";

describe("group apply link", () => {
  it("builds a public path with a normalized organizer application id", () => {
    expect(buildGroupApplyPath("proplane-abc12345")).toBe(
      "/rent/apply?groupLeaderAppId=PROPLANE-ABC12345",
    );
  });

  it("preserves propertyId when building a scoped invite link", () => {
    expect(buildGroupApplyPath("PROPLANE-ABC12345", { propertyId: "mgr-demo-1" })).toBe(
      "/rent/apply?groupLeaderAppId=PROPLANE-ABC12345&propertyId=mgr-demo-1",
    );
  });

  it("parses groupLeaderAppId query values", () => {
    expect(parseGroupLeaderAppIdParam(" proplane-xyz98765 ")).toBe("PROPLANE-XYZ98765");
    expect(parseGroupLeaderAppIdParam("")).toBe("");
  });

  it("prefills household fields for a roommate invite link", () => {
    expect(groupLeaderInviteFormPatch("proplane-abc12345")).toEqual({
      applicantRole: "signer",
      applyingAsGroup: "yes",
      groupRole: "joining",
      groupLeaderAppId: "PROPLANE-ABC12345",
    });
  });
});
