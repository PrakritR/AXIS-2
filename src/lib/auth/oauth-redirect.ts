/** Post-auth path used after OAuth callback exchanges the Supabase code. */
export function oauthContinuePath(nextPath: string): string {
  if (!nextPath.startsWith("/")) return "/auth/continue";
  return `/auth/continue?next=${encodeURIComponent(nextPath)}`;
}

/** Manager signup/checkout routes must return directly after OAuth (not via /auth/continue). */
export function usesDirectOAuthReturn(nextPath: string): boolean {
  return (
    nextPath.startsWith("/auth/manager-pricing-oauth") ||
    nextPath.startsWith("/auth/manager-oauth-finish")
  );
}

/** Supabase OAuth redirect target — must be allowlisted in Supabase Auth settings. */
export function authCallbackUrl(origin: string, nextPath: string): string {
  const base = origin.trim().replace(/\/$/, "");
  const next = nextPath.startsWith("/") ? nextPath : "/auth/continue";
  return `${base}/auth/callback?next=${encodeURIComponent(next)}`;
}
