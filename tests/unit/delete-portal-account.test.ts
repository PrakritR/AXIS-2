import { beforeEach, describe, expect, it, vi } from "vitest";

const { purgeResidentPortalData, purgeManagerPortalData, findAuthUserIdByEmail, removePortalAccess } = vi.hoisted(
  () => ({
    purgeResidentPortalData: vi.fn(),
    purgeManagerPortalData: vi.fn(),
    findAuthUserIdByEmail: vi.fn(),
    removePortalAccess: vi.fn(),
  }),
);

vi.mock("@/lib/auth/purge-portal-account-data", () => ({
  purgeResidentPortalData,
  purgeManagerPortalData,
}));

vi.mock("@/lib/auth/find-auth-user-id-by-email", () => ({
  findAuthUserIdByEmail,
}));

vi.mock("@/lib/auth/remove-portal-access", () => ({
  removePortalAccess,
}));

import {
  canHardDeleteResident,
  deletePortalAccountCompletely,
  deleteResidentAccount,
} from "@/lib/auth/delete-portal-account";

function mockDb(roleRows: { role: string }[], legacyRole = "resident") {
  const userId = "user-dual";
  findAuthUserIdByEmail.mockResolvedValue(userId);
  return {
    from: (table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { id: userId, role: legacyRole, email: "dual@test.com" } }),
            }),
          }),
          delete: () => ({
            eq: async () => ({ error: null }),
          }),
        };
      }
      if (table === "profile_roles") {
        return {
          select: () => ({
            eq: async () => ({ data: roleRows }),
          }),
          delete: () => ({
            eq: async () => ({ error: null }),
          }),
        };
      }
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
        delete: () => ({ eq: async () => ({ error: null }) }),
      };
    },
    auth: { admin: { deleteUser: vi.fn(async () => ({ error: null })) } },
  };
}

describe("delete-portal-account", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    removePortalAccess.mockResolvedValue({ ok: true, mode: "revoked_role", remainingRoles: ["manager"] });
  });

  it("reports non-hard-deletable residents that also have manager role", async () => {
    const db = mockDb([{ role: "resident" }, { role: "manager" }]);
    const guard = await canHardDeleteResident(db as never, "dual@test.com");
    expect(guard.ok).toBe(false);
  });

  it("revokes resident role when user also has manager role", async () => {
    const db = mockDb([{ role: "resident" }, { role: "manager" }]);

    const result = await deleteResidentAccount(db as never, {
      email: "dual@test.com",
      purgeData: true,
    });

    expect(result.ok).toBe(true);
    expect(purgeResidentPortalData).toHaveBeenCalled();
    expect(removePortalAccess).toHaveBeenCalledWith(db, "user-dual", "resident");
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

  it("fully deletes portal accounts for admin cleanup", async () => {
    const deleteUser = vi.fn(async () => ({ error: null }));
    const db = {
      from: (table: string) => {
        if (table === "profiles") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { email: "manager@test.com" } }),
              }),
            }),
            delete: () => ({
              eq: async () => ({ error: null }),
            }),
          };
        }
        if (table === "profile_roles") {
          return {
            delete: () => ({
              eq: async () => ({ error: null }),
            }),
          };
        }
        return {
          delete: () => ({
            eq: async () => ({ error: null }),
            ilike: async () => ({ error: null }),
          }),
        };
      },
      auth: { admin: { deleteUser } },
    };

    const result = await deletePortalAccountCompletely(db as never, "user-1");

    expect(purgeManagerPortalData).toHaveBeenCalledWith(db, "user-1");
    expect(purgeResidentPortalData).toHaveBeenCalledWith(db, {
      email: "manager@test.com",
      userId: "user-1",
    });
    expect(deleteUser).toHaveBeenCalledWith("user-1");
    expect(result).toEqual({ ok: true, mode: "deleted_auth_user" });
  });
});
