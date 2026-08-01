import { resolveShareableAppOrigin } from "@/lib/app-url";

/** Where a verified recovery token lands the user. */
export const PASSWORD_RESET_NEXT_PATH = "/auth/reset-password";

/**
 * Reset links point at OUR `/auth/confirm`, carrying the recovery token hash —
 * NEVER at `/auth/callback` with a PKCE `code`.
 *
 * Supabase's hosted verify redirect hands back a PKCE authorization code, and the
 * matching `code_verifier` lives only in the storage of the browser that requested
 * the reset. Opening the emailed link anywhere else (Gmail on a phone, a second
 * browser — the normal path) fails with "PKCE code verifier not found in storage".
 * A `token_hash` is verified by `verifyOtp` and is not bound to any browser, so the
 * link works wherever it is opened while staying single-use and short-lived.
 */
export function passwordResetConfirmUrl(origin: string, tokenHash: string): string {
  const base = origin.trim().replace(/\/$/, "");
  return `${base}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=recovery`;
}

/**
 * OAuth redirect target must stay on the current browser origin so the session
 * cookie and post-login route match (never bounce localhost → production).
 */
export function resolveOAuthBrowserOrigin(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin.replace(/\/$/, "");
  }
  return resolveShareableAppOrigin();
}
