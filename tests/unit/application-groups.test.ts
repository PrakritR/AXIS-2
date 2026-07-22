import { describe, expect, it } from "vitest";
import {
  applicationHasGroup,
  buildApplicationGroups,
  describeGroupBadge,
  groupForRow,
  makeApplicationGroupId,
  normalizeGroupId,
  resolveEditGroupId,
  resolveSubmitGroupId,
  summarizeGroupProgress,
  type GroupRowInput,
} from "@/lib/rental-application/application-groups";

function row(overrides: Partial<GroupRowInput> & Pick<GroupRowInput, "id">): GroupRowInput {
  return {
    name: "Applicant",
    email: `${overrides.id}@test.local`,
    role: "joining",
    groupId: "AXISGRP-ABCD1234",
    groupSize: "",
    status: "submitted",
    ...overrides,
  };
}

describe("makeApplicationGroupId", () => {
  it("produces an AXISGRP- id that passes the group-id length/prefix rule", () => {
    const id = makeApplicationGroupId();
    expect(id.startsWith("AXISGRP-")).toBe(true);
    expect(id.length).toBe(16);
    expect(normalizeGroupId(id)).toBe(id.toUpperCase());
  });

  it("mints distinct ids within the same millisecond (random, not timestamp-derived)", () => {
    const ids = new Set(Array.from({ length: 200 }, () => makeApplicationGroupId()));
    expect(ids.size).toBe(200);
  });
});

describe("normalizeGroupId", () => {
  it("uppercases and trims", () => {
    expect(normalizeGroupId("  axisgrp-abcd1234 ")).toBe("AXISGRP-ABCD1234");
    expect(normalizeGroupId(null)).toBe("");
    expect(normalizeGroupId(undefined)).toBe("");
  });
});

describe("applicationHasGroup", () => {
  it("is true only for an in-group application with an id", () => {
    expect(applicationHasGroup({ applyingAsGroup: "yes", groupId: "AXISGRP-1" })).toBe(true);
    expect(applicationHasGroup({ applyingAsGroup: "yes", groupId: "" })).toBe(false);
    expect(applicationHasGroup({ applyingAsGroup: "no", groupId: "AXISGRP-1" })).toBe(false);
    expect(applicationHasGroup(null)).toBe(false);
  });
});

describe("resolveSubmitGroupId", () => {
  it("mints a new id for the first applicant when none is set", () => {
    const id = resolveSubmitGroupId(
      { applyingAsGroup: "yes", groupRole: "first", groupId: "" },
      () => "AXISGRP-MINTED",
    );
    expect(id).toBe("AXISGRP-MINTED");
  });

  it("keeps the pasted id for a joining applicant and never mints one", () => {
    expect(
      resolveSubmitGroupId({ applyingAsGroup: "yes", groupRole: "joining", groupId: "AXISGRP-XYZ" }, () => "NOPE"),
    ).toBe("AXISGRP-XYZ");
    expect(resolveSubmitGroupId({ applyingAsGroup: "yes", groupRole: "joining", groupId: "" }, () => "NOPE")).toBe("");
  });

  it("returns empty for a non-group application", () => {
    expect(resolveSubmitGroupId({ applyingAsGroup: "no", groupRole: null, groupId: "" }, () => "NOPE")).toBe("");
  });
});

describe("resolveEditGroupId", () => {
  it("carries the persisted id forward when an edit blanks the field", () => {
    expect(
      resolveEditGroupId(
        { applyingAsGroup: "yes", groupRole: "first", groupId: "" },
        "AXISGRP-ABCD1234",
        () => "AXISGRP-NEWMINT",
      ),
    ).toBe("AXISGRP-ABCD1234");
  });

  it("keeps one stable id across an edit and re-save for a joining member", () => {
    expect(
      resolveEditGroupId(
        { applyingAsGroup: "yes", groupRole: "joining", groupId: "AXISGRP-ABCD1234" },
        "AXISGRP-ABCD1234",
        () => "AXISGRP-NEWMINT",
      ),
    ).toBe("AXISGRP-ABCD1234");
  });

  it("mints only when a group application has never had an id", () => {
    expect(
      resolveEditGroupId({ applyingAsGroup: "yes", groupRole: "first", groupId: "" }, "", () => "AXISGRP-NEWMINT"),
    ).toBe("AXISGRP-NEWMINT");
    expect(
      resolveEditGroupId({ applyingAsGroup: "yes", groupRole: "joining", groupId: "" }, undefined, () => "NOPE"),
    ).toBe("");
  });

  it("drops the id only when the resident deliberately opts out of the group", () => {
    expect(
      resolveEditGroupId({ applyingAsGroup: "no", groupRole: null, groupId: "" }, "AXISGRP-ABCD1234", () => "NOPE"),
    ).toBe("");
  });
});

describe("buildApplicationGroups", () => {
  it("groups rows by normalized id, derives expected size from the first applicant, and counts progress", () => {
    const rows: GroupRowInput[] = [
      row({ id: "a", role: "first", groupSize: "3", status: "submitted" }),
      row({ id: "b", role: "joining", status: "submitted" }),
      row({ id: "c", role: "joining", groupId: "axisgrp-abcd1234", status: "in_progress" }),
      // unrelated / non-group rows are ignored
      row({ id: "d", groupId: "", role: null }),
    ];
    const groups = buildApplicationGroups(rows);
    expect(groups.size).toBe(1);
    const g = groups.get("AXISGRP-ABCD1234")!;
    expect(g.expectedSize).toBe(3);
    expect(g.totalCount).toBe(3);
    expect(g.submittedCount).toBe(2);
    expect(g.missingCount).toBe(0);
    expect(g.hasFirst).toBe(true);
    // 3 present but one still in progress → not yet complete (no silent deadlock: visible)
    expect(g.isComplete).toBe(false);
    // first applicant sorts ahead of joining members
    expect(g.members[0]!.role).toBe("first");
  });

  it("marks a group complete only when all expected members are present and submitted", () => {
    const rows: GroupRowInput[] = [
      row({ id: "a", role: "first", groupSize: "2", status: "submitted" }),
      row({ id: "b", role: "joining", status: "approved" }),
    ];
    const g = buildApplicationGroups(rows).get("AXISGRP-ABCD1234")!;
    expect(g.isComplete).toBe(true);
    expect(g.missingCount).toBe(0);
  });

  it("reports missing members when fewer have applied than the declared size", () => {
    const rows: GroupRowInput[] = [row({ id: "a", role: "first", groupSize: "4", status: "submitted" })];
    const g = buildApplicationGroups(rows).get("AXISGRP-ABCD1234")!;
    expect(g.missingCount).toBe(3);
    expect(g.isComplete).toBe(false);
    expect(summarizeGroupProgress(g).label).toContain("waiting on 3");
  });

  it("leaves expected size null when no first applicant has submitted yet", () => {
    const rows: GroupRowInput[] = [row({ id: "b", role: "joining", status: "submitted" })];
    const g = buildApplicationGroups(rows).get("AXISGRP-ABCD1234")!;
    expect(g.expectedSize).toBeNull();
    expect(g.missingCount).toBeNull();
    expect(summarizeGroupProgress(g).label).toBe("1 applicant");
  });

  it("never reads complete when more rows carry the id than the declared size", () => {
    const rows: GroupRowInput[] = [
      row({ id: "a", role: "first", groupSize: "3", status: "submitted" }),
      row({ id: "b", role: "joining", status: "submitted" }),
      row({ id: "c", role: "joining", status: "submitted" }),
      row({ id: "d", role: "joining", status: "submitted" }),
    ];
    const g = buildApplicationGroups(rows).get("AXISGRP-ABCD1234")!;
    expect(g.totalCount).toBe(4);
    expect(g.expectedSize).toBe(3);
    expect(g.isOverSubscribed).toBe(true);
    expect(g.isComplete).toBe(false);
    expect(summarizeGroupProgress(g)).toEqual({ label: "4 applicants · 3 declared", tone: "pending" });
    expect(describeGroupBadge(g).label).toBe("Group 4 · 3 declared");
  });

  it("reports — without blaming the applicant — a group with no visible organizer row", () => {
    const rows: GroupRowInput[] = [
      row({ id: "b", role: "joining", status: "submitted" }),
      row({ id: "c", role: "joining", status: "submitted" }),
    ];
    const g = buildApplicationGroups(rows).get("AXISGRP-ABCD1234")!;
    expect(g.hasFirst).toBe(false);
    const badge = describeGroupBadge(g);
    expect(badge.label).toBe("Group 2 · organizer not shown");
    expect(badge.tone).toBe("info");
    expect(badge.title).toContain("visible in your applications");
    expect(badge.title).not.toContain("mistyped");
  });

  it("de-duplicates a row id that appears twice", () => {
    const rows: GroupRowInput[] = [
      row({ id: "a", role: "first", groupSize: "2" }),
      row({ id: "a", role: "first", groupSize: "2" }),
    ];
    const g = buildApplicationGroups(rows).get("AXISGRP-ABCD1234")!;
    expect(g.totalCount).toBe(1);
  });
});

describe("groupForRow", () => {
  it("returns the group for a member row and null for a non-group row", () => {
    const rows: GroupRowInput[] = [row({ id: "a", role: "first", groupSize: "2" })];
    const groups = buildApplicationGroups(rows);
    expect(groupForRow(groups, { groupId: "axisgrp-abcd1234" })?.groupId).toBe("AXISGRP-ABCD1234");
    expect(groupForRow(groups, { groupId: "" })).toBeNull();
    expect(groupForRow(groups, { groupId: "AXISGRP-OTHER" })).toBeNull();
  });
});

describe("summarizeGroupProgress", () => {
  it("labels a complete group affirmatively", () => {
    const rows: GroupRowInput[] = [
      row({ id: "a", role: "first", groupSize: "2", status: "submitted" }),
      row({ id: "b", role: "joining", status: "submitted" }),
    ];
    const g = buildApplicationGroups(rows).get("AXISGRP-ABCD1234")!;
    expect(summarizeGroupProgress(g)).toEqual({ label: "All 2 applied", tone: "confirmed" });
  });
});

describe("describeGroupBadge", () => {
  it("shows a raw count with no denominator when the declared size is unknown", () => {
    const rows: GroupRowInput[] = [
      row({ id: "a", role: "first", groupSize: "", status: "submitted" }),
      row({ id: "b", role: "joining", status: "submitted" }),
    ];
    const g = buildApplicationGroups(rows).get("AXISGRP-ABCD1234")!;
    expect(g.expectedSize).toBeNull();
    expect(describeGroupBadge(g).label).toBe("Group 2");
  });

  it("counts submitted members in the numerator, matching the roster summary", () => {
    const rows: GroupRowInput[] = [
      row({ id: "a", role: "first", groupSize: "3", status: "submitted" }),
      row({ id: "b", role: "joining", status: "flagged" }),
      row({ id: "c", role: "joining", status: "in_progress" }),
    ];
    const g = buildApplicationGroups(rows).get("AXISGRP-ABCD1234")!;
    expect(describeGroupBadge(g).label).toBe("Group 2/3");
    expect(summarizeGroupProgress(g).label).toBe("2 of 3 applied · waiting on 1");
    expect(g.isComplete).toBe(false);
  });

  it("marks a fully applied group confirmed", () => {
    const rows: GroupRowInput[] = [
      row({ id: "a", role: "first", groupSize: "2", status: "screened" }),
      row({ id: "b", role: "joining", status: "approved" }),
    ];
    const g = buildApplicationGroups(rows).get("AXISGRP-ABCD1234")!;
    expect(describeGroupBadge(g)).toEqual({
      label: "Group 2/2",
      tone: "confirmed",
      title: "Group ID AXISGRP-ABCD1234",
    });
  });
});
