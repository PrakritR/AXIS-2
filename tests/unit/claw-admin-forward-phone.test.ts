import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The shared-line forward target must come from the admin account's DB phone
 * (admin-role resolution) and only fall back to the legacy env/hardcoded cell
 * when no admin profile has a phone. Exercised through isMappedManagerPhone,
 * which treats the resolved admin forward phone as a mapped manager cell.
 */

const adminIds: string[] = [];
const adminProfileRows: Array<{ id: string; phone: string | null }> = [];

vi.mock("@/lib/auth/admin-role", () => ({
  listAdminUserIds: vi.fn(async () => adminIds),
}));

vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceRoleClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        in: vi.fn(() => ({
          not: vi.fn(() => ({
            order: vi.fn(async () => ({ data: adminProfileRows, error: null })),
          })),
        })),
        // resolveMappedManagerContacts path (profiles by email) — no rows needed
        ilike: vi.fn(async () => ({ data: [], error: null })),
      })),
    })),
  })),
}));

describe("resolveAdminForwardPhone via isMappedManagerPhone", () => {
  beforeEach(() => {
    vi.resetModules();
    adminIds.length = 0;
    adminProfileRows.length = 0;
    delete process.env.CLAW_MESSENGER_MANAGER_FORWARD_PHONES;
  });

  it("treats the admin profile's DB phone as the mapped forward cell", async () => {
    adminIds.push("admin-1");
    adminProfileRows.push({ id: "admin-1", phone: "+15550001111" });
    const { isMappedManagerPhone } = await import("@/lib/claw-resident-messaging.server");
    await expect(isMappedManagerPhone("+15550001111")).resolves.toBe(true);
  });

  it("falls back to the legacy trial cell when no admin profile has a phone", async () => {
    const { isMappedManagerPhone } = await import("@/lib/claw-resident-messaging.server");
    // Hardcoded DEFAULT_MANAGER_PHONE fallback preserved for envs without an admin phone.
    await expect(isMappedManagerPhone("+15103098345")).resolves.toBe(true);
  });

  it("does not accept an arbitrary phone as a mapped manager cell", async () => {
    adminIds.push("admin-1");
    adminProfileRows.push({ id: "admin-1", phone: "+15550001111" });
    const { isMappedManagerPhone } = await import("@/lib/claw-resident-messaging.server");
    await expect(isMappedManagerPhone("+19998887777")).resolves.toBe(false);
  });
});
