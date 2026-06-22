import { beforeEach, describe, expect, it, vi } from "vitest";
import { jsonRequest, parseJsonResponse } from "../../helpers/api-request";

vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceRoleClient: vi.fn(),
}));

vi.mock("@/lib/auth/verify-auth-password", () => ({
  assertPasswordMatchesExistingAuthUser: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("@/lib/auth/profile-role-row", () => ({
  ensureProfileRoleRow: vi.fn().mockResolvedValue(undefined),
}));

import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { POST as registerAdmin } from "@/app/api/auth/register-admin/route";

describe("POST /api/auth/register-admin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects invalid admin key", async () => {
    const req = jsonRequest("http://localhost/api/auth/register-admin", {
      method: "POST",
      body: { email: "a@test.com", password: "password123", adminKey: "wrong" },
    });
    const res = await registerAdmin(req);
    const { status, data } = await parseJsonResponse<{ error: string }>(res);
    expect(status).toBe(401);
    expect(data.error).toContain("Invalid admin");
  });

  it("rejects short password", async () => {
    const req = jsonRequest("http://localhost/api/auth/register-admin", {
      method: "POST",
      body: { email: "a@test.com", password: "short", adminKey: "prakrit-admin-register" },
    });
    const res = await registerAdmin(req);
    expect(res.status).toBe(400);
  });

  it("creates admin user on valid request", async () => {
    const mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null }) }),
      }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    });
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue({
      auth: {
        admin: {
          createUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }),
          listUsers: vi.fn(),
        },
      },
      from: mockFrom,
    } as never);

    const req = jsonRequest("http://localhost/api/auth/register-admin", {
      method: "POST",
      body: {
        email: "admin@test.com",
        password: "password123",
        adminKey: "prakrit-admin-register",
        fullName: "Test Admin",
      },
    });
    const res = await registerAdmin(req);
    const { status, data } = await parseJsonResponse<{ ok: boolean }>(res);
    expect(status).toBe(200);
    expect(data.ok).toBe(true);
  });
});
