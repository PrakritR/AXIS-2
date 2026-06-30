import { describe, expect, it } from "vitest";
import { supabaseGoogleOAuthRedirectUri } from "@/lib/auth/google-oauth-redirect";

describe("supabaseGoogleOAuthRedirectUri", () => {
  it("builds Supabase Google callback URI", () => {
    expect(supabaseGoogleOAuthRedirectUri("https://qahnczmilgptcedaqype.supabase.co")).toBe(
      "https://qahnczmilgptcedaqype.supabase.co/auth/v1/callback",
    );
  });

  it("returns null when URL missing", () => {
    // Isolate the env fallback so the "missing" case is deterministic regardless of
    // a local .env.test that sets NEXT_PUBLIC_SUPABASE_URL.
    const saved = process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    try {
      expect(supabaseGoogleOAuthRedirectUri(null)).toBeNull();
      expect(supabaseGoogleOAuthRedirectUri("")).toBeNull();
    } finally {
      if (saved !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = saved;
    }
  });
});
