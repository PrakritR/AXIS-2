import { describe, expect, it } from "vitest";
import {
  buildBugFeedbackReportInput,
  countBugFeedbackTabs,
  filterBugFeedbackByTab,
  groupBugFeedbackForAdmin,
  isManagerSideReporterRole,
  isPortalBugFeedbackSchemaError,
  normalizeBugFeedbackRow,
  roleGroupLabelForFeedback,
} from "@/lib/portal-bug-feedback-utils";

describe("portal bug feedback utils", () => {
  it("normalizes bug and feedback rows from API payloads", () => {
    const bug = normalizeBugFeedbackRow({
      id: "bf-1",
      type: "bug",
      reporterEmail: "Manager@Example.com",
      reporterRole: "pro",
      title: "Broken button",
      description: "Cannot save",
      severity: "high",
      status: "open",
    });
    expect(bug?.type).toBe("bug");
    expect(bug?.reporterEmail).toBe("manager@example.com");
    expect(bug?.severity).toBe("high");

    const feedback = normalizeBugFeedbackRow({
      id: "bf-2",
      type: "feedback",
      reporterRole: "resident",
      title: "Love the portal",
      description: "Easy to use",
    });
    expect(feedback?.type).toBe("feedback");
    expect(feedback?.severity).toBeUndefined();
  });

  it("normalizes DB column aliases and report_type", () => {
    const row = normalizeBugFeedbackRow({
      id: "bf-3",
      report_type: "feedback",
      reporter_user_id: "user-1",
      reporter_name: "Sam",
      reporter_email: "Sam@Example.com",
      reporter_role: "resident",
      title: "Great app",
      description: "Works well",
      created_at: "2026-02-01T12:00:00.000Z",
      updated_at: "2026-02-02T12:00:00.000Z",
    });
    expect(row?.type).toBe("feedback");
    expect(row?.reporterUserId).toBe("user-1");
    expect(row?.reporterName).toBe("Sam");
    expect(row?.reporterEmail).toBe("sam@example.com");
    expect(row?.reporterRole).toBe("resident");
    expect(row?.createdAt).toBe("2026-02-01T12:00:00.000Z");
  });

  it("normalizes attachment urls", () => {
    const row = normalizeBugFeedbackRow({
      id: "bf-4",
      type: "bug",
      attachmentUrls: ["https://example.com/a.png"],
      title: "Screenshot bug",
      description: "See image",
    });
    expect(row?.attachmentUrls).toEqual(["https://example.com/a.png"]);
  });

  it("rejects malformed rows", () => {
    expect(normalizeBugFeedbackRow(null)).toBeNull();
    expect(normalizeBugFeedbackRow({ type: "bug" })).toBeNull();
  });

  it("detects missing feedback table errors", () => {
    expect(
      isPortalBugFeedbackSchemaError(
        "Could not find the 'portal_bug_feedback_records' table in the schema cache",
      ),
    ).toBe(true);
    expect(isPortalBugFeedbackSchemaError("Unauthorized")).toBe(false);
  });

  it("builds a new report with trimmed fields", () => {
    const row = buildBugFeedbackReportInput({
      type: "feedback",
      reporterUserId: "u1",
      reporterName: "  Alex  ",
      reporterEmail: " Alex@Example.com ",
      reporterRole: "resident",
      title: "  Great UX ",
      description: "  Thanks ",
      id: "bf-test",
      now: "2026-01-01T00:00:00.000Z",
    });
    expect(row.reporterName).toBe("Alex");
    expect(row.reporterEmail).toBe("alex@example.com");
    expect(row.status).toBe("open");
  });

  it("counts tabs and filters by newest first", () => {
    const rows = [
      buildBugFeedbackReportInput({
        type: "bug",
        reporterUserId: "1",
        reporterName: "A",
        reporterEmail: "a@test.com",
        reporterRole: "manager",
        title: "Old bug",
        description: "x",
        id: "1",
        now: "2026-01-01T00:00:00.000Z",
      }),
      buildBugFeedbackReportInput({
        type: "feedback",
        reporterUserId: "2",
        reporterName: "B",
        reporterEmail: "b@test.com",
        reporterRole: "resident",
        title: "Feedback",
        description: "y",
        id: "2",
        now: "2026-01-02T00:00:00.000Z",
      }),
    ];
    expect(countBugFeedbackTabs(rows)).toEqual({ bugs: 1, feedback: 1 });
    expect(filterBugFeedbackByTab(rows, "feedback").map((r) => r.id)).toEqual(["2"]);
  });

  it("groups admin rows by manager-side vs resident roles", () => {
    const rows = [
      buildBugFeedbackReportInput({
        type: "bug",
        reporterUserId: "1",
        reporterName: "M",
        reporterEmail: "m@test.com",
        reporterRole: "pro",
        title: "Manager bug",
        description: "x",
        id: "m1",
      }),
      buildBugFeedbackReportInput({
        type: "bug",
        reporterUserId: "2",
        reporterName: "R",
        reporterEmail: "r@test.com",
        reporterRole: "resident",
        title: "Resident bug",
        description: "y",
        id: "r1",
      }),
    ];
    const grouped = groupBugFeedbackForAdmin(rows);
    expect(grouped.managerRows).toHaveLength(1);
    expect(grouped.residentRows).toHaveLength(1);
    expect(isManagerSideReporterRole("pro")).toBe(true);
    expect(isManagerSideReporterRole("resident")).toBe(false);
    expect(roleGroupLabelForFeedback("resident")).toBe("Resident");
    expect(roleGroupLabelForFeedback("pro")).toBe("Manager");
  });

  it("recognizes vendor as a manager-side reporter role with its own label", () => {
    expect(isManagerSideReporterRole("vendor")).toBe(true);
    expect(roleGroupLabelForFeedback("vendor")).toBe("Vendor");
    expect(normalizeBugFeedbackRow({ id: "bf-5", reporterRole: "vendor", title: "t", description: "d" })?.reporterRole).toBe(
      "vendor",
    );
  });
});
