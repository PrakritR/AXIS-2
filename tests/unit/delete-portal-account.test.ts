import { beforeEach, describe, expect, it, vi } from "vitest";

const { purgeResidentPortalData, findAuthUserIdByEmail } = vi.hoisted(() => ({
  purgeResidentPortalData: vi.fn(),
  findAuthUserIdByEmail: vi.fn(),
}));

vi.mock("@/lib/auth/purge-portal-account-data", () => ({
  purgeResidentPortalData,
  purgeManagerPortalData: vi.fn(),
}));

vi.mock("@/lib/auth/find-auth-user-id-by-email", () => ({
  findAuthUserIdByEmail,
}));

import { canHardDeleteResident, deleteResidentAccount } from "@/lib/auth/delete-portal-account";

function mockDb(roleRows: { role: string }[], legacyRole = "resident") {
  const userId = "user-dual";
  findAuthUserIdByEmail.mockResolvedValue(userId);
  return {
    from: (table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { id: userId, role: legacyRole } }),
            }),
          }),
        };
      }
      if (table === "profile_roles") {
        return {
          select: () => ({
            eq: async () => ({ data: roleRows }),
          }),
        };
      }
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
        delete: () => ({ eq: async () => ({}) }),
      };
    },
    auth: { admin: { deleteUser: vi.fn() } },
  };
}

describe("delete-portal-account", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks purge when user has protected manager role", async () => {
    const db = mockDb([{ role: "resident" }, { role: "manager" }]);
    const guard = await canHardDeleteResident(db as never, "dual@test.com");
    expect(guard.ok).toBe(false);

    const result = await deleteResidentAccount(db as never, {
      email: "dual@test.com",
      purgeData: true,
    });
    expect(result.ok).toBe(false);
    expect(purgeResidentPortalData).not.toHaveBeenCalled();
  });

  it("purges application-only deletes with purged_data_only mode", async () => {
    findAuthUserIdByEmail.mockResolvedValue(null);
    const db = {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
      }),
      auth: { admin: { deleteUser: vi.fn() } },
    };

    const result = await deleteResidentAccount(db as never, {
      applicationId: "app-1",
      purgeData: true,
    });

    expect(purgeResidentPortalData).toHaveBeenCalledWith(db, {
      email: "",
      userId: null,
      applicationId: "app-1",
    });
    expect(result).toEqual({ ok: true, mode: "purged_data_only" });
  });
});
