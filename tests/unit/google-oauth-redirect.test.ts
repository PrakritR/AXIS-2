import { describe, expect, it } from "vitest";
import { supabaseGoogleOAuthRedirectUri } from "@/lib/auth/google-oauth-redirect";

describe("supabaseGoogleOAuthRedirectUri", () => {
  it("builds Supabase Google callback URI", () => {
    expect(supabaseGoogleOAuthRedirectUri("https://qahnczmilgptcedaqype.supabase.co")).toBe(
      "https://qahnczmilgptcedaqype.supabase.co/auth/v1/callback",
    );
  });

  it("returns null when URL missing", () => {
    expect(supabaseGoogleOAuthRedirectUri(null)).toBeNull();
    expect(supabaseGoogleOAuthRedirectUri("")).toBeNull();
  });
});
