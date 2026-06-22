import { beforeEach, describe, expect, it, vi } from "vitest";
import { jsonRequest, parseJsonResponse } from "../../helpers/api-request";

vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceRoleClient: vi.fn(),
}));

import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { POST as partnerInquiries } from "@/app/api/public/partner-inquiries/route";

describe("POST /api/public/partner-inquiries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("validates required fields", async () => {
    const req = jsonRequest("http://localhost/api/public/partner-inquiries", {
      method: "POST",
      body: { name: "", email: "bad", message: "" },
    });
    const res = await partnerInquiries(req);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("accepts valid partner inquiry", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "portal_schedule_records") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { row_data: { payload: [] } }, error: null }),
              }),
            }),
            upsert,
          };
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        };
      }),
    } as never);

    const req = jsonRequest("http://localhost/api/public/partner-inquiries", {
      method: "POST",
      body: {
        row: {
          kind: "partner",
          name: "Test Partner",
          email: "partner@example.com",
          phone: "2065550100",
          message: "Interested in Axis for my properties.",
          company: "Test Co",
        },
      },
    });
    const res = await partnerInquiries(req);
    const { status } = await parseJsonResponse(res);
    expect(status).toBe(200);
    expect(upsert).toHaveBeenCalled();
  });
});
