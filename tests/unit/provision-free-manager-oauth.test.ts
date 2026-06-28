import { describe, expect, it } from "vitest";
import { isGoogleOrGmailAccount } from "@/lib/auth/provision-free-manager-oauth";
import type { User } from "@supabase/supabase-js";

function user(partial: Partial<User> & { email?: string }): User {
  return {
    id: "u1",
    aud: "authenticated",
    created_at: "",
    app_metadata: {},
    user_metadata: {},
    ...partial,
  } as User;
}

describe("provision-free-manager-oauth helpers", () => {
  it("detects Gmail addresses", () => {
    expect(isGoogleOrGmailAccount(user({ email: "test@gmail.com" }))).toBe(true);
    expect(isGoogleOrGmailAccount(user({ email: "test@company.com" }))).toBe(false);
  });

  it("detects Google OAuth identities", () => {
    expect(
      isGoogleOrGmailAccount(
        user({
          email: "test@company.com",
          identities: [
            {
              provider: "google",
              id: "1",
              user_id: "u1",
              identity_data: {},
              created_at: "",
              updated_at: "",
              last_sign_in_at: "",
            },
          ],
        }),
      ),
    ).toBe(true);
  });
});
