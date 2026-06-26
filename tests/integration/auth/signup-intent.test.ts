import { beforeEach, describe, expect, it, vi } from "vitest";
import { jsonRequest, parseJsonResponse } from "../../helpers/api-request";

vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceRoleClient: vi.fn(),
}));

import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { POST as signupIntent } from "@/app/api/manager/signup-intent/route";

describe("POST /api/manager/signup-intent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects paid tier without promo waiver", async () => {
    const req = jsonRequest("http://localhost/api/manager/signup-intent", {
      method: "POST",
      body: {
        tier: "pro",
        billing: "monthly",
        email: "mgr@test.com",
        fullName: "Test Manager",
        promo: "",
      },
    });
    const res = await signupIntent(req);
    const { status, data } = await parseJsonResponse<{ code?: string }>(res);
    expect(status).toBe(400);
    expect(data.code).toBe("REQUIRES_CHECKOUT");
  });

  it("creates signup intent with FREE100 promo", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [] }),
        }),
        insert,
      }),
    } as never);

    const req = jsonRequest("http://localhost/api/manager/signup-intent", {
      method: "POST",
      body: {
        tier: "pro",
        billing: "monthly",
        email: "newmgr@test.com",
        fullName: "New Manager",
        promo: "FREE100",
      },
    });
    const res = await signupIntent(req);
    const { status, data } = await parseJsonResponse<{ sessionId: string }>(res);
    expect(status).toBe(200);
    expect(data.sessionId).toMatch(/^axis_intent_/);
    expect(insert).toHaveBeenCalled();
  });

  it("rejects partial onboard discount without checkout", async () => {
    const req = jsonRequest("http://localhost/api/manager/signup-intent", {
      method: "POST",
      body: {
        tier: "pro",
        billing: "monthly",
        email: "mgr@test.com",
        fullName: "Test Manager",
        discountPercent: 25,
      },
    });
    const res = await signupIntent(req);
    const { status, data } = await parseJsonResponse<{ code?: string }>(res);
    expect(status).toBe(400);
    expect(data.code).toBe("REQUIRES_CHECKOUT");
  });

  it("creates free tier signup without promo", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [] }),
        }),
        insert,
      }),
    } as never);

    const req = jsonRequest("http://localhost/api/manager/signup-intent", {
      method: "POST",
      body: {
        tier: "free",
        billing: "monthly",
        email: "freemgr@test.com",
        fullName: "Free Manager",
      },
    });
    const res = await signupIntent(req);
    expect(res.status).toBe(200);
  });

  it("creates paid tier signup with onboard 100% discount", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [] }),
        }),
        insert,
      }),
    } as never);

    const req = jsonRequest("http://localhost/api/manager/signup-intent", {
      method: "POST",
      body: {
        tier: "pro",
        billing: "monthly",
        email: "onboard-free@test.com",
        fullName: "Onboard Free",
        discountPercent: 100,
      },
    });
    const res = await signupIntent(req);
    const { status, data } = await parseJsonResponse<{ sessionId: string }>(res);
    expect(status).toBe(200);
    expect(data.sessionId).toMatch(/^axis_intent_/);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        promo_code: "ONBOARD_FREE_PRO",
      }),
    );
  });
});
