import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/resident-manager-scope", async () => {
  const actual = await vi.importActual<typeof import("@/lib/resident-manager-scope")>(
    "@/lib/resident-manager-scope",
  );
  return {
    ...actual,
    residentHasApprovedResidency: vi.fn(),
  };
});

import { residentHasApprovedResidency } from "@/lib/resident-manager-scope";
import { repairServiceRequestScopesForManager } from "@/lib/repair-service-request-scopes.server";

type SrRec = {
  id: string;
  manager_user_id: string | null;
  resident_email: string;
  property_id: string | null;
  status: string;
  row_data: Record<string, unknown>;
};

function mockDb(
  apps: { resident_email: string; property_id: string; bucket?: string }[],
  srs: SrRec[],
) {
  const upserts: unknown[] = [];
  const client = {
    from(table: string) {
      if (table === "manager_application_records") {
        return {
          select: () => ({
            eq: () => ({
              limit: async () => ({
                data: apps.map((a) => ({
                  resident_email: a.resident_email,
                  property_id: a.property_id,
                  assigned_property_id: null,
                  row_data: { bucket: a.bucket ?? "approved" },
                })),
                error: null,
              }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          in: () => ({
            limit: async () => ({ data: srs, error: null }),
          }),
        }),
        upsert: async (rec: unknown) => {
          upserts.push(rec);
          return { error: null };
        },
      };
    },
  };
  return { client, upserts };
}

describe("repairServiceRequestScopesForManager", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reclaims a mis-stamped request from a manager who only has a pending app", async () => {
    vi.mocked(residentHasApprovedResidency).mockImplementation(async (_db, params) => {
      return params.managerUserId === "mgr-demo";
    });
    const { client, upserts } = mockDb(
      [{ resident_email: "resident@test.axis.local", property_id: "mgr-demo-pioneer", bucket: "approved" }],
      [
        {
          id: "SR-orphan",
          manager_user_id: "mgr-2",
          resident_email: "resident@test.axis.local",
          property_id: "mgr-test-spruce",
          status: "pending",
          row_data: {
            id: "SR-orphan",
            offerName: "Reserved parking spot",
            offerId: "parking",
            residentEmail: "resident@test.axis.local",
            managerUserId: "mgr-2",
            propertyId: "mgr-test-spruce",
          },
        },
      ],
    );

    const result = await repairServiceRequestScopesForManager(client as never, "mgr-demo");
    expect(result.repaired).toBe(1);
    expect(upserts[0]).toMatchObject({
      id: "SR-orphan",
      manager_user_id: "mgr-demo",
      property_id: "mgr-demo-pioneer",
      resident_email: "resident@test.axis.local",
    });
  });

  it("does not steal a request that belongs to another approved residency", async () => {
    vi.mocked(residentHasApprovedResidency).mockResolvedValue(true);
    const { client, upserts } = mockDb(
      [{ resident_email: "res@test.axis.local", property_id: "pioneer-1", bucket: "approved" }],
      [
        {
          id: "SR-other",
          manager_user_id: "mgr-other",
          resident_email: "res@test.axis.local",
          property_id: "other-prop",
          status: "pending",
          row_data: { id: "SR-other", managerUserId: "mgr-other", propertyId: "other-prop" },
        },
      ],
    );

    const result = await repairServiceRequestScopesForManager(client as never, "mgr-1");
    expect(result.repaired).toBe(0);
    expect(upserts).toHaveLength(0);
  });
});
