import { describe, expect, it, vi } from "vitest";
import { syncOAuthProfile } from "@/lib/auth/sync-oauth-profile";

function mockSupabase(existingProfile: Record<string, unknown> | null) {
  const update = vi.fn().mockResolvedValue({ error: null });
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const profileRolesUpsert = vi.fn().mockResolvedValue({ error: null });

  const from = vi.fn((table: string) => {
    if (table === "profiles") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: existingProfile }),
          }),
        }),
        update: (...args: unknown[]) => ({
          eq: () => update(...args),
        }),
        upsert: (...args: unknown[]) => upsert(...args),
      };
    }
    if (table === "profile_roles") {
      return {
        upsert: profileRolesUpsert,
      };
    }
    throw new Error(`unexpected table ${table}`);
  });

  return { from, update, upsert, profileRolesUpsert };
}

describe("syncOAuthProfile", () => {
  it("updates missing full name on existing profiles", async () => {
    const supabase = mockSupabase({
      id: "user-1",
      email: "resident@test.com",
      full_name: null,
      role: "resident",
    });

    await syncOAuthProfile(supabase as never, {
      id: "user-1",
      email: "resident@test.com",
      user_metadata: { full_name: "Resident User" },
    } as never);

    expect(supabase.update).toHaveBeenCalled();
  });

  it("provisions primary admin when profile is missing", async () => {
    const supabase = mockSupabase(null);

    await syncOAuthProfile(supabase as never, {
      id: "admin-1",
      email: "admin@axis-seattle-housing.com",
      user_metadata: { name: "Prakrit" },
    } as never);

    expect(supabase.upsert).toHaveBeenCalled();
    expect(supabase.profileRolesUpsert).toHaveBeenCalledTimes(2);
  });
});
