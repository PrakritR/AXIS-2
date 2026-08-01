/**
 * Read the OAuth failure a redirect handed back on the query string.
 *
 * `nativeOAuthSignInFailureUrl` (and the server `/auth/callback` handlers) report a failed
 * sign-in by navigating to `/auth/sign-in?error=oauth&message=…`. Whatever renders that route
 * has to read these params or the message is lost and the user just sees the page reload —
 * which is exactly how the native shell's "it just refreshes and goes back" was experienced.
 *
 * One implementation, used by every auth screen that route can land on.
 *
 * `message` is echoed ONLY when it is copy this codebase authored
 * (`isAuthoredOAuthFailureMessage`). `/auth/sign-in` is a credential-entry screen, so rendering
 * arbitrary query text there would let a crafted link put attacker-written copy — "your account
 * is locked, call this number" — above a real password field on the real domain. Genuinely
 * dynamic third-party text (a raw Google `error_description`, an ASWebAuthenticationSession
 * `localizedDescription`) degrades to the generic message; that is the intended trade.
 */
import { isAuthoredOAuthFailureMessage } from "@/lib/auth/oauth-failure-messages";

export type OAuthErrorParams = Pick<URLSearchParams, "get">;

export const OAUTH_GENERIC_FAILURE_MESSAGE =
  "Sign-in could not be completed. Try again or use email and password.";

export function oauthErrorFromParams(params: OAuthErrorParams | null | undefined): string | null {
  if (!params) return null;
  const authError = params.get("error");
  if (authError !== "oauth" && authError !== "auth") return null;
  const message = params.get("message")?.trim();
  if (authError === "oauth" && message && isAuthoredOAuthFailureMessage(message)) return message;
  return OAUTH_GENERIC_FAILURE_MESSAGE;
}
