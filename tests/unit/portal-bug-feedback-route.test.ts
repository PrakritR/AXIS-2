import { describe, expect, it, vi } from "vitest";

const { createJsonRecordRoute } = vi.hoisted(() => ({
  createJsonRecordRoute: vi.fn((config) => ({ GET: vi.fn(), POST: vi.fn(), config })),
}));

vi.mock("@/lib/portal-record-api", () => ({
  createJsonRecordRoute,
}));

import "@/app/api/portal-bug-feedback/route";

type RouteUser = { id: string; email?: string | null; role: string };

const routeConfig = createJsonRecordRoute.mock.calls[0][0] as {
  buildUpsert: (row: Record<string, unknown>, user: RouteUser) => Record<string, unknown>;
  assignOwnership: (record: Record<string, unknown>, user: RouteUser) => Record<string, unknown>;
};

describe("portal bug feedback route", () => {
  it("uses server-trusted reporter details for non-admin upserts", () => {
    const record = routeConfig.buildUpsert(
      {
        id: "bf-1",
        reporterEmail: "spoof@example.com",
        reporter_email: "spoof@example.com",
        reporterRole: "admin",
        reporter_role: "admin",
        type: "bug",
      },
      { id: "manager-1", email: "manager@example.com", role: "manager" },
    );

    expect(record.reporter_user_id).toBe("manager-1");
    expect(record.reporter_email).toBe("manager@example.com");
    expect(record.reporter_role).toBe("manager");
    expect(record.row_data).toMatchObject({
      reporterUserId: "manager-1",
      reporter_user_id: "manager-1",
      reporterEmail: "manager@example.com",
      reporter_email: "manager@example.com",
      reporterRole: "manager",
      reporter_role: "manager",
    });
  });

  it("stamps ownership over client reporter fields on insert", () => {
    const record = routeConfig.assignOwnership(
      {
        id: "bf-1",
        reporter_user_id: "other-user",
        reporter_email: "spoof@example.com",
        reporter_role: "admin",
        row_data: {
          reporterUserId: "other-user",
          reporterEmail: "spoof@example.com",
          reporterRole: "admin",
        },
      },
      { id: "resident-1", email: "resident@example.com", role: "resident" },
    );

    expect(record).toMatchObject({
      reporter_user_id: "resident-1",
      reporter_email: "resident@example.com",
      reporter_role: "resident",
      row_data: {
        reporterUserId: "resident-1",
        reporter_user_id: "resident-1",
        reporterEmail: "resident@example.com",
        reporter_email: "resident@example.com",
        reporterRole: "resident",
        reporter_role: "resident",
      },
    });
  });
});
