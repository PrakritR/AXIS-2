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

vi.mock("@/lib/auth/manager-signup-trial", () => ({
  completeManagerSignupTrial: vi.fn().mockResolvedValue({ managerId: "MGR-TRIAL-01" }),
  isManagerSignupTrialTier: vi.fn((tier: string) => tier === "free" || tier === "pro" || tier === "business"),
}));

vi.mock("@/lib/auth/manager-onboarding", () => ({
  findManagerPurchaseForAccount: vi.fn(),
  isManagerOnboardingComplete: vi.fn(),
  provisionPendingManagerAccount: vi.fn(),
}));

import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { findAuthUserIdByEmail } from "@/lib/auth/find-auth-user-id-by-email";
import { completeManagerSignupTrial } from "@/lib/auth/manager-signup-trial";
import {
  findManagerPurchaseForAccount,
  isManagerOnboardingComplete,
  provisionPendingManagerAccount,
} from "@/lib/auth/manager-onboarding";
import { POST as managerRegister } from "@/app/api/auth/manager-register/route";

describe("POST /api/auth/manager-register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns portal redirect when email already has a complete manager account", async () => {
    vi.mocked(findAuthUserIdByEmail).mockResolvedValue("user-existing");
    vi.mocked(findManagerPurchaseForAccount).mockResolvedValue({
      id: "purchase-1",
      email: "manager@example.com",
      manager_id: "MGR-EXIST-01",
      tier: "free",
      billing: "monthly",
      stripe_checkout_session_id: "axis_intent_abc",
      user_id: "user-existing",
      full_name: "Existing Manager",
      paid_at: "2026-01-01T00:00:00.000Z",
    } as never);
    vi.mocked(isManagerOnboardingComplete).mockReturnValue(true);

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
        if (table === "manager_purchases") {
          return {
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
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

  it("grants trial tier and redirects to portal when tier is provided", async () => {
    vi.mocked(findManagerPurchaseForAccount).mockResolvedValue(null);
    vi.mocked(isManagerOnboardingComplete).mockReturnValue(false);
    vi.mocked(provisionPendingManagerAccount).mockResolvedValue({ managerId: "MGR-PENDING-01" });

    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue({
      auth: {
        admin: {
          createUser: vi.fn().mockResolvedValue({
            data: { user: { id: "user-new" } },
            error: null,
          }),
        },
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        upsert: vi.fn().mockResolvedValue({ error: null }),
      }),
    } as never);

    const req = jsonRequest("http://localhost/api/auth/manager-register", {
      method: "POST",
      body: {
        email: "trial@example.com",
        password: "password123",
        fullName: "Trial Manager",
        tier: "pro",
      },
    });

    const res = await managerRegister(req);
    const { status, data } = await parseJsonResponse<{
      ok?: boolean;
      managerId?: string;
      redirectTo?: string;
    }>(res);

    expect(status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.managerId).toBe("MGR-PENDING-01");
    expect(data.redirectTo).toBe("/portal/dashboard");
    expect(completeManagerSignupTrial).toHaveBeenCalledWith(expect.anything(), {
      userId: "user-new",
      email: "trial@example.com",
      fullName: "Trial Manager",
      tier: "pro",
    });
  });
});
