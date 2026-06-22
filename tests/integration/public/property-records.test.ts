import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceRoleClient: vi.fn(),
}));

import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { GET as publicListings } from "@/app/api/property-records/public/route";

describe("GET /api/property-records/public", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns live listings", async () => {
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: [
                {
                  property_data: {
                    id: "p1",
                    buildingName: "Test House",
                    address: "123 Main St",
                  },
                },
              ],
              error: null,
            }),
          }),
        }),
      }),
    } as never);

    const res = await publicListings();
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.listings).toHaveLength(1);
    expect(data.listings[0].id).toBe("p1");
  });

  it("handles database errors", async () => {
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: null, error: { message: "db error" } }),
          }),
        }),
      }),
    } as never);

    const res = await publicListings();
    expect(res.status).toBe(500);
  });
});
