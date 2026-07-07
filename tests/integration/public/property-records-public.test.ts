import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseJsonResponse } from "../../helpers/api-request";

vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceRoleClient: vi.fn(),
}));

vi.mock("@/lib/server-env", () => ({
  isProductionRuntime: vi.fn(() => false),
}));

import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { isProductionRuntime } from "@/lib/server-env";
import { GET as publicPropertyRecords } from "@/app/api/property-records/public/route";

describe("GET /api/property-records/public", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns live listings from Supabase and treats status=live as publishable", async () => {
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: "mgr-live-1",
                    property_data: {
                      id: "mgr-live-1",
                      title: "Live House",
                      buildingName: "Live House",
                      address: "123 Main St",
                      adminPublishLive: true,
                    },
                  },
                  {
                    id: "mgr-live-2",
                    property_data: {
                      id: "mgr-live-2",
                      title: "Legacy Live House",
                      buildingName: "Legacy Live House",
                      address: "456 Oak Ave",
                    },
                  },
                ],
                error: null,
              }),
            }),
          }),
        }),
      }),
    } as never);

    const res = await publicPropertyRecords();
    const { status, data } = await parseJsonResponse<{ listings?: { id: string; adminPublishLive?: boolean }[] }>(res);

    expect(status).toBe(200);
    expect(data.listings?.map((row) => row.id).sort()).toEqual(["mgr-live-1", "mgr-live-2"]);
    expect(data.listings?.every((row) => row.adminPublishLive === true)).toBe(true);
  });

  it("drops sandbox listings on production", async () => {
    vi.mocked(isProductionRuntime).mockReturnValue(true);
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === "manager_property_records") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: "real-1",
                      manager_user_id: "mgr-real",
                      property_data: {
                        id: "real-1",
                        title: "Real House",
                        buildingName: "Real House",
                        address: "4709A 8th Ave NE, Seattle, WA",
                        adminPublishLive: true,
                      },
                    },
                    {
                      id: "qa-demo",
                      manager_user_id: "mgr-qa",
                      property_data: {
                        id: "qa-demo",
                        title: "Demo QA",
                        buildingName: "Demo QA",
                        address: "123 Demo Test St, Seattle, WA",
                        adminPublishLive: true,
                      },
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: [
                { id: "mgr-real", email: "prakritramachandran@gmail.com" },
                { id: "mgr-qa", email: "someone@gmail.com" },
              ],
              error: null,
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue({ from } as never);

    const res = await publicPropertyRecords();
    const { status, data } = await parseJsonResponse<{ listings?: { id: string }[] }>(res);

    expect(status).toBe(200);
    expect(data.listings?.map((row) => row.id)).toEqual(["real-1"]);
  });
});
