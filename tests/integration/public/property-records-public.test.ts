import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseJsonResponse } from "../../helpers/api-request";

vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceRoleClient: vi.fn(),
}));

import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
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
});
