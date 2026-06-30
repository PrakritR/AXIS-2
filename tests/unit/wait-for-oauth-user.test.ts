import { describe, expect, it, vi } from "vitest";
import { waitForOAuthUser } from "@/lib/auth/wait-for-oauth-user";

describe("waitForOAuthUser", () => {
  it("returns the user once getUser succeeds", async () => {
    const user = { id: "u1" };
    const supabase = {
      auth: {
        getUser: vi
          .fn()
          .mockResolvedValueOnce({ data: { user: null } })
          .mockResolvedValueOnce({ data: { user } }),
      },
    };

    const result = await waitForOAuthUser(supabase as never, { attempts: 3, delayMs: 1 });
    expect(result).toBe(user);
    expect(supabase.auth.getUser).toHaveBeenCalledTimes(2);
  });

  it("returns null when getUser never resolves to a user", async () => {
    const supabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
    };

    const result = await waitForOAuthUser(supabase as never, { attempts: 2, delayMs: 1 });
    expect(result).toBeNull();
  });
});
