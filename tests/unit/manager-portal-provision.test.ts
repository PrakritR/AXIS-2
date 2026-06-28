import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";

const findManagerPurchaseForAccount = vi.fn();
const isManagerOnboardingComplete = vi.fn();
const provisionPendingManagerAccount = vi.fn();
const finalizePendingManagerFreeTier = vi.fn();
const ensureProfileRoleRow = vi.fn();
const isPrimaryAdminEmail = vi.fn();

vi.mock("@/lib/auth/manager-onboarding", () => ({
  findManagerPurchaseForAccount: (...args: unknown[]) => findManagerPurchaseForAccount(...args),
  isManagerOnboardingComplete: (...args: unknown[]) => isManagerOnboardingComplete(...args),
  isAxisPendingSessionId: (id: string) => id.startsWith("axis_pending_"),
  provisionPendingManagerAccount: (...args: unknown[]) => provisionPendingManagerAccount(...args),
  finalizePendingManagerFreeTier: (...args: unknown[]) => finalizePendingManagerFreeTier(...args),
}));

vi.mock("@/lib/auth/profile-role-row", () => ({
  ensureProfileRoleRow: (...args: unknown[]) => ensureProfileRoleRow(...args),
}));

vi.mock("@/lib/auth/primary-admin", () => ({
  isPrimaryAdminEmail: (...args: unknown[]) => isPrimaryAdminEmail(...args),
}));

function testUser(partial: Partial<User> = {}): User {
  return {
    id: "user-1",
    email: "new@test.com",
    aud: "authenticated",
    created_at: "",
    app_metadata: {},
    user_metadata: { full_name: "New User" },
    ...partial,
  } as User;
}

function mockSupabase() {
  return {
    from: (table: string) => {
      if (table === "profile_roles") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
        };
      }
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
          }),
          upsert: () => Promise.resolve({ error: null }),
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        };
      }
      if (table === "manager_purchases") {
        return {
          select: () => ({
            ilike: () => ({
              is: () => ({
                not: () => ({
                  limit: () => Promise.resolve({ data: [], error: null }),
                }),
              }),
            }),
          }),
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

describe("ensureFreeManagerPortalAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isPrimaryAdminEmail.mockReturnValue(false);
    isManagerOnboardingComplete.mockReturnValue(false);
    provisionPendingManagerAccount.mockResolvedValue({ managerId: "AXIS-NEW", created: true });
    finalizePendingManagerFreeTier.mockResolvedValue({ sessionId: "axis_intent_1", managerId: "AXIS-NEW" });
    ensureProfileRoleRow.mockResolvedValue(undefined);
  });

  it("provisions pending purchase into a free portal account", async () => {
    const { ensureFreeManagerPortalAccess } = await import("@/lib/auth/manager-portal-provision");
    const pendingId = "axis_pending_test-id";
    findManagerPurchaseForAccount.mockResolvedValue({
      id: "purchase-1",
      email: "new@test.com",
      manager_id: "AXIS-PENDING",
      tier: null,
      billing: null,
      stripe_checkout_session_id: pendingId,
      user_id: "user-1",
      paid_at: null,
    });

    const result = await ensureFreeManagerPortalAccess(mockSupabase() as never, testUser());

    expect(result).toEqual({ status: "portal_ready", managerId: "AXIS-PENDING", provisioned: true });
    expect(finalizePendingManagerFreeTier).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tier: "free", userId: "user-1" }),
    );
  });

  it("returns portal_ready without reprovisioning complete accounts", async () => {
    const { ensureFreeManagerPortalAccess } = await import("@/lib/auth/manager-portal-provision");
    isManagerOnboardingComplete.mockReturnValue(true);
    findManagerPurchaseForAccount.mockResolvedValue({
      id: "purchase-1",
      email: "new@test.com",
      manager_id: "AXIS-DONE",
      tier: "free",
      billing: "monthly",
      stripe_checkout_session_id: "oauth_free_user-1",
      user_id: "user-1",
      paid_at: new Date().toISOString(),
    });

    const result = await ensureFreeManagerPortalAccess(mockSupabase() as never, testUser());

    expect(result).toEqual({ status: "portal_ready", managerId: "AXIS-DONE", provisioned: false });
    expect(provisionPendingManagerAccount).not.toHaveBeenCalled();
  });
});
