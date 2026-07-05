import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";

const ensureFreeManagerPortalAccess = vi.fn();
const completeResidentSignupFromOAuth = vi.fn();

vi.mock("@/lib/auth/manager-portal-provision", () => ({
  ensureFreeManagerPortalAccess: (...args: unknown[]) => ensureFreeManagerPortalAccess(...args),
}));

vi.mock("@/lib/auth/complete-resident-signup-oauth", () => ({
  completeResidentSignupFromOAuth: (...args: unknown[]) => completeResidentSignupFromOAuth(...args),
}));

vi.mock("@/lib/auth/manager-onboarding", () => ({
  managerNeedsPricingSelection: vi.fn(async () => false),
  findManagerPurchaseForAccount: vi.fn(async () => null),
  isManagerOnboardingComplete: vi.fn(() => false),
}));

vi.mock("@/lib/auth/primary-admin", () => ({
  isPrimaryAdminEmail: vi.fn(() => false),
}));

function mockSupabase(applicationRows: { id: string; resident_email: string; row_data: object }[] = []) {
  return {
    from: (table: string) => {
      if (table === "profile_roles") {
        return { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) };
      }
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
        };
      }
      if (table === "manager_purchases") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
              is: () => ({
                order: () => ({
                  limit: () => Promise.resolve({ data: [], error: null }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "manager_application_records") {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: applicationRows, error: null }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

describe("resolveOAuthPortalRedirect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("never auto-provisions a free manager; unknown manager-intent goes to the plan picker", async () => {
    const { resolveOAuthPortalRedirect } = await import("@/lib/auth/resolve-oauth-portal-access");

    const user = { id: "user-1", email: "new@test.com" } as User;
    const path = await resolveOAuthPortalRedirect(mockSupabase() as never, user, "/auth/continue", {
      intent: "manager",
      surface: "native",
    });

    expect(ensureFreeManagerPortalAccess).not.toHaveBeenCalled();
    expect(path).toBe("/auth/manager/plan");
  });

  it("routes an unknown, no-intent account to the get-started role chooser", async () => {
    const { resolveOAuthPortalRedirect } = await import("@/lib/auth/resolve-oauth-portal-access");

    const user = { id: "user-1", email: "mystery@test.com" } as User;
    const path = await resolveOAuthPortalRedirect(mockSupabase() as never, user, "/auth/continue");

    expect(ensureFreeManagerPortalAccess).not.toHaveBeenCalled();
    expect(path).toBe("/auth/get-started");
  });

  it("routes a legacy profiles.role manager to the manager portal", async () => {
    const { resolveOAuthPortalRedirect } = await import("@/lib/auth/resolve-oauth-portal-access");

    const user = { id: "user-1", email: "manager@test.com" } as User;
    const supabase = {
      from: (table: string) => {
        if (table === "profile_roles") {
          return { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) };
        }
        if (table === "profiles") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: { role: "manager" }, error: null }),
              }),
            }),
          };
        }
        if (table === "manager_purchases") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: null, error: null }),
                is: () => ({
                  order: () => ({
                    limit: () => Promise.resolve({ data: [], error: null }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === "manager_application_records") {
          return {
            select: () => ({
              eq: () => Promise.resolve({ data: [], error: null }),
            }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };

    const path = await resolveOAuthPortalRedirect(supabase as never, user, "/auth/continue");
    expect(path).toBe("/portal/dashboard");
  });

  it("routes failed approved resident signup to create-account with error", async () => {
    const { resolveOAuthPortalRedirect } = await import("@/lib/auth/resolve-oauth-portal-access");
    completeResidentSignupFromOAuth.mockResolvedValue({
      ok: false,
      status: 409,
      error: "This email already has a different login.",
    });

    const user = { id: "user-1", email: "resident@example.com" } as User;
    const supabase = mockSupabase([
      {
        id: "APP-1",
        resident_email: "resident@example.com",
        row_data: { bucket: "approved" },
      },
    ]);

    const path = await resolveOAuthPortalRedirect(supabase as never, user, "/portal/dashboard");

    expect(path).toContain("/auth/create-account");
    expect(path).toContain("message=resident_signup_failed");
    expect(path).toContain("error=This+email+already+has+a+different+login.");
  });
});
