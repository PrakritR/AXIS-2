/** Post-auth path used after OAuth callback exchanges the Supabase code. */
export function oauthContinuePath(nextPath: string): string {
  if (!nextPath.startsWith("/")) return "/auth/continue";
  return `/auth/continue?next=${encodeURIComponent(nextPath)}`;
}

/** Manager signup/checkout routes must return directly after OAuth (not via /auth/continue). */
export function usesDirectOAuthReturn(nextPath: string): boolean {
  return (
    nextPath.startsWith("/auth/manager-pricing-oauth") ||
    nextPath.startsWith("/auth/manager-oauth-finish") ||
    nextPath.startsWith("/auth/manager-register-oauth")
  );
}

/** Supabase OAuth redirect target — must be allowlisted in Supabase Auth settings. */
export function authCallbackUrl(origin: string, nextPath: string): string {
  const base = origin.trim().replace(/\/$/, "");
  const next = nextPath.startsWith("/") ? nextPath : "/auth/continue";
  return `${base}/auth/callback?next=${encodeURIComponent(next)}`;
}

/**
 * Bare OAuth callback URL (no query). Post-auth path is stored in {@link OAUTH_NEXT_COOKIE}
 * so Supabase allowlists like `http://localhost:3000/auth/callback` match exactly.
 */
export function bareAuthCallbackUrl(origin: string): string {
  return `${origin.trim().replace(/\/$/, "")}/auth/callback`;
}

/** Partner pricing Google signup — fixed path with no query params for Supabase allowlist matching. */
export function partnerPricingOAuthCallbackUrl(origin: string): string {
  const base = origin.trim().replace(/\/$/, "");
  return `${base}/auth/callback/partner-pricing`;
}

/** Resident create-account Google signup — fixed callback for Supabase allowlist matching. */
export function residentSignupOAuthCallbackUrl(origin: string): string {
  const base = origin.trim().replace(/\/$/, "");
  return `${base}/auth/callback/resident-signup`;
}
