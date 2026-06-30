import { describe, it, expect } from "vitest";
import { listResidentsTool } from "@/lib/tools/domains/residents";
import { listApplicationsTool } from "@/lib/tools/domains/applications";
import { listPropertiesTool } from "@/lib/tools/domains/properties";
import { makeManagerRowsCtx, managerRow, type FakeRecord } from "./fake-agent-ctx";

const SENSITIVE_APP = {
  ssn: "123-45-6789",
  income: 90000,
  employer: "ACME",
};

describe("list_applications", () => {
  const ctx = makeManagerRowsCtx({
    manager_application_records: [
      managerRow("manager_a", {
        id: "a1",
        name: "Pat",
        email: "Pat@X.com",
        property: "12 Main",
        stage: "Screening",
        bucket: "pending",
        application: SENSITIVE_APP,
        backgroundCheckStatus: "flagged",
        screening: { report: "raw certn data" },
      }),
      managerRow("manager_a", { id: "a2", name: "Sam", bucket: "approved", application: SENSITIVE_APP, backgroundCheckStatus: "passed" }),
      managerRow("manager_b", { id: "a3", name: "Other", bucket: "pending" }),
    ],
  });

  it("scopes to the landlord and filters by bucket + screening status", async () => {
    const pending = (await listApplicationsTool.handler(ctx, { bucket: "pending" })) as {
      count: number;
      applications: { id: string; screeningStatus: string }[];
    };
    expect(pending.count).toBe(1);
    expect(pending.applications[0]!).toMatchObject({ id: "a1", screeningStatus: "flagged" });

    const flagged = (await listApplicationsTool.handler(ctx, { screeningStatus: "flagged" })) as {
      applications: { id: string }[];
    };
    expect(flagged.applications.map((a) => a.id)).toEqual(["a1"]);
  });

  it("never leaks the raw application form or screening report", async () => {
    const res = (await listApplicationsTool.handler(ctx, {})) as { applications: Record<string, unknown>[] };
    for (const app of res.applications) {
      expect(app).not.toHaveProperty("application");
      expect(app).not.toHaveProperty("screening");
      expect(JSON.stringify(app)).not.toContain("123-45-6789");
    }
  });
});

describe("list_residents", () => {
  const ctx = makeManagerRowsCtx({
    manager_application_records: [
      managerRow("manager_a", { id: "r1", name: "Pat", email: "p@x.com", property: "12 Main St", bucket: "approved", signedMonthlyRent: 1500, application: SENSITIVE_APP }),
      managerRow("manager_a", { id: "r2", name: "Pending Person", bucket: "pending", application: SENSITIVE_APP }),
      managerRow("manager_b", { id: "r3", name: "Other", bucket: "approved" }),
    ],
  });

  it("returns only approved residents for the landlord, no PII", async () => {
    const res = (await listResidentsTool.handler(ctx, {})) as { count: number; residents: Record<string, unknown>[] };
    expect(res.count).toBe(1);
    expect(res.residents[0]).toMatchObject({ id: "r1", monthlyRent: 1500 });
    expect(res.residents[0]).not.toHaveProperty("application");
    expect(JSON.stringify(res.residents)).not.toContain("123-45-6789");
  });

  it("filters by property substring", async () => {
    const res = (await listResidentsTool.handler(ctx, { property: "main" })) as { count: number };
    expect(res.count).toBe(1);
    const none = (await listResidentsTool.handler(ctx, { property: "nowhere" })) as { count: number };
    expect(none.count).toBe(0);
  });
});

describe("list_properties", () => {
  const rec = (managerUserId: string, id: string, status: string, data: Record<string, unknown>, key: "row_data" | "property_data" = "property_data"): FakeRecord =>
    ({ id, manager_user_id: managerUserId, status, row_data: key === "row_data" ? data : {}, property_data: key === "property_data" ? data : {} } as unknown as FakeRecord);

  const ctx = makeManagerRowsCtx({
    manager_property_records: [
      rec("manager_a", "p1", "live", { id: "p1", title: "Sunset Lofts", address: "1 A St", beds: 2, baths: 1, rentLabel: "$2,000/mo" }),
      rec("manager_a", "p2", "pending", { id: "p2", title: "Draft House", address: "2 B St" }, "row_data"),
      rec("manager_b", "p3", "live", { id: "p3", title: "Other" }),
    ],
  });

  it("returns only the landlord's properties and filters by status", async () => {
    const all = (await listPropertiesTool.handler(ctx, {})) as { count: number; properties: { id: string }[] };
    expect(all.count).toBe(2);
    expect(all.properties.map((p) => p.id).sort()).toEqual(["p1", "p2"]);

    const live = (await listPropertiesTool.handler(ctx, { status: "live" })) as {
      properties: { id: string; title: string; rent: string | null }[];
    };
    expect(live.properties).toHaveLength(1);
    expect(live.properties[0]!).toMatchObject({ id: "p1", title: "Sunset Lofts", rent: "$2,000/mo" });
  });
});
