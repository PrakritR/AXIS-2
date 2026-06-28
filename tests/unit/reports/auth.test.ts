import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const profileRoles = vi.fn();
const profileSelect = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser },
  })),
}));

vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceRoleClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: profileSelect,
            }),
          }),
        };
      }
      if (table === "profile_roles") {
        return {
          select: () => ({
            eq: () => profileRoles(),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  })),
}));

vi.mock("@/lib/auth/admin-preview", () => ({
  isAdminUser: vi.fn(async () => false),
}));

describe("getReportsAuthContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "dual@example.com", user_metadata: {} } },
    });
    profileSelect.mockResolvedValue({
      data: { email: "dual@example.com", role: "manager" },
    });
    profileRoles.mockResolvedValue({
      data: [{ role: "manager" }, { role: "resident" }],
    });
  });

  it("prefers resident role for resident financial reports when user has both roles", async () => {
    const { getReportsAuthContext } = await import("@/lib/reports/auth");
    const ctx = await getReportsAuthContext({ preferRole: "resident" });
    expect(ctx?.role).toBe("resident");
  });

  it("defaults dual-role users to manager when no preference is set", async () => {
    const { getReportsAuthContext } = await import("@/lib/reports/auth");
    const ctx = await getReportsAuthContext();
    expect(ctx?.role).toBe("manager");
  });

  it("prefers manager role for manager financial reports when user has both roles", async () => {
    const { getReportsAuthContext } = await import("@/lib/reports/auth");
    const ctx = await getReportsAuthContext({ preferRole: "manager" });
    expect(ctx?.role).toBe("manager");
  });
});
