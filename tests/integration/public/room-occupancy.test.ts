import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceRoleClient: vi.fn(),
}));

import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { GET as roomOccupancy } from "@/app/api/public/approved-room-occupancy/route";

describe("GET /api/public/approved-room-occupancy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns approved occupancy rows", async () => {
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({
              data: [
                {
                  row_data: {
                    id: "app-1",
                    bucket: "approved",
                    propertyId: "p1",
                    application: { roomChoice1: "room-1", leaseStart: "2026-06-01" },
                  },
                },
              ],
              error: null,
            }),
          }),
        }),
      }),
    } as never);

    const res = await roomOccupancy();
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.rows).toHaveLength(1);
  });
});
