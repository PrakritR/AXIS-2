import { describe, expect, it } from "vitest";

import { signedInWithGoogle } from "@/lib/google-calendar/link-from-auth.server";
import type { User } from "@supabase/supabase-js";

function user(partial: Partial<User>): User {
  return partial as User;
}

describe("signedInWithGoogle", () => {
  it("detects google via identities", () => {
    expect(
      signedInWithGoogle(
        user({ identities: [{ provider: "google", id: "1", user_id: "u", identity_data: {}, created_at: "", updated_at: "", last_sign_in_at: "" }] }),
      ),
    ).toBe(true);
  });

  it("detects google via app_metadata provider", () => {
    expect(signedInWithGoogle(user({ app_metadata: { provider: "google" } }))).toBe(true);
  });

  it("rejects email-only accounts", () => {
    expect(signedInWithGoogle(user({ email: "manager@test.com", identities: [] }))).toBe(false);
  });
});
