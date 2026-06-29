import { beforeEach, describe, expect, it, vi } from "vitest";
import { jsonRequest, parseJsonResponse } from "../../helpers/api-request";

vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceRoleClient: vi.fn(),
}));

vi.mock("@/lib/auth/find-auth-user-id-by-email", () => ({
  findAuthUserIdByEmail: vi.fn(),
}));

vi.mock("@/lib/auth/verify-auth-password", () => ({
  assertPasswordMatchesExistingAuthUser: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("@/lib/auth/profile-primary-role", () => ({
  primaryRoleWhenAddingManager: vi.fn((role?: string) => role ?? "manager"),
}));

vi.mock("@/lib/auth/profile-role-row", () => ({
  ensureProfileRoleRow: vi.fn().mockResolvedValue(undefined),
}));

import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { findAuthUserIdByEmail } from "@/lib/auth/find-auth-user-id-by-email";
import { POST as managerRegister } from "@/app/api/auth/manager-register/route";

describe("POST /api/auth/manager-register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns portal redirect when email already has a complete manager account", async () => {
    vi.mocked(findAuthUserIdByEmail).mockResolvedValue("user-existing");

    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue({
      auth: {
        admin: {
          createUser: vi.fn().mockResolvedValue({
            data: null,
            error: { message: "User already registered" },
          }),
        },
      },
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "manager_purchases") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: {
                        id: "purchase-1",
                        email: "manager@example.com",
                        manager_id: "MGR-EXIST-01",
                        tier: "free",
                        billing: "monthly",
                        stripe_checkout_session_id: "axis_intent_abc",
                        user_id: "user-existing",
                        full_name: "Existing Manager",
                        paid_at: "2026-01-01T00:00:00.000Z",
                      },
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        if (table === "profiles") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: "user-existing", role: "manager", manager_id: "MGR-EXIST-01" },
                  error: null,
                }),
              }),
            }),
            upsert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          upsert: vi.fn().mockResolvedValue({ error: null }),
        };
      }),
    } as never);

    const req = jsonRequest("http://localhost/api/auth/manager-register", {
      method: "POST",
      body: {
        email: "manager@example.com",
        password: "password123",
        fullName: "Existing Manager",
      },
    });

    const res = await managerRegister(req);
    const { status, data } = await parseJsonResponse<{
      ok?: boolean;
      existingAccount?: boolean;
      redirectTo?: string;
    }>(res);

    expect(status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.existingAccount).toBe(true);
    expect(data.redirectTo).toBe("/portal/dashboard");
  });
});
