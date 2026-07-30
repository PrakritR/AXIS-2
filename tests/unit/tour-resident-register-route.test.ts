import { beforeEach, describe, expect, it, vi } from "vitest";
import { jsonRequest } from "../helpers/api-request";

vi.mock("@/lib/analytics/posthog", () => ({ track: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ ok: true }),
  clientIpFrom: () => "127.0.0.1",
}));
vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceRoleClient: vi.fn(),
}));
vi.mock("@/lib/tour-resident-link.server", () => ({
  loadTourInquiryById: vi.fn(),
  linkTourInquiryToResident: vi.fn(),
  linkAllTourInquiriesForEmail: vi.fn(),
}));

import { loadTourInquiryById } from "@/lib/tour-resident-link.server";
import { POST as tourResidentRegister } from "@/app/api/auth/tour-resident-register/route";

describe("POST /api/auth/tour-resident-register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadTourInquiryById).mockRejectedValue(new Error("database connection string leaked"));
  });

  it("does not leak internal error details on unexpected failures", async () => {
    const res = await tourResidentRegister(
      jsonRequest("http://localhost/api/auth/tour-resident-register", {
        method: "POST",
        body: {
          email: "guest@example.com",
          password: "password123",
          phone: "+12065550100",
          tourInquiryId: "inq-1",
        },
      }),
    );
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("Could not create your account. Check your details and try again.");
    expect(body.error).not.toContain("database");
  });
});
