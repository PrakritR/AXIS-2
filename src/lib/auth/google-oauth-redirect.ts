/** Redirect URI Google OAuth must allowlist (Supabase handles the Google callback). */
export function supabaseGoogleOAuthRedirectUri(supabaseUrl?: string | null): string | null {
  const base = supabaseUrl?.trim().replace(/\/$/, "") ?? process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, "");
  if (!base) return null;
  return `${base}/auth/v1/callback`;
}
