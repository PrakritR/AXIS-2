import { describe, it, expect } from "vitest";
import { listServiceRequestsTool } from "@/lib/tools/domains/services";
import { makeManagerRowsCtx, managerRow } from "./fake-agent-ctx";

describe("list_service_requests", () => {
  const ctx = makeManagerRowsCtx({
    portal_service_request_records: [
      managerRow("manager_a", {
        id: "SR-1",
        offerName: "Parking spot",
        residentName: "Pat",
        residentEmail: "P@X.com",
        propertyId: "prop1",
        status: "pending",
        price: "$50",
        deposit: "$0",
        servicePaid: false,
        depositPaid: false,
        returnPhotoDataUrl: "data:image/png;base64,SECRETBLOB",
      }),
      managerRow("manager_a", { id: "SR-2", offerName: "Bike", status: "approved", servicePaid: true }),
      managerRow("manager_b", { id: "SR-3", offerName: "Other", status: "pending" }),
    ],
  });

  it("returns only the landlord's service requests and filters by status", async () => {
    const all = (await listServiceRequestsTool.handler(ctx, {})) as { count: number; serviceRequests: { id: string }[] };
    expect(all.count).toBe(2);
    expect(all.serviceRequests.map((s) => s.id).sort()).toEqual(["SR-1", "SR-2"]);

    const pending = (await listServiceRequestsTool.handler(ctx, { status: "pending" })) as {
      serviceRequests: { id: string }[];
    };
    expect(pending.serviceRequests.map((s) => s.id)).toEqual(["SR-1"]);
  });

  it("omits the return-photo blob from results", async () => {
    const res = (await listServiceRequestsTool.handler(ctx, {})) as { serviceRequests: Record<string, unknown>[] };
    for (const s of res.serviceRequests) expect(s).not.toHaveProperty("returnPhotoDataUrl");
    expect(JSON.stringify(res.serviceRequests)).not.toContain("SECRETBLOB");
  });
});
