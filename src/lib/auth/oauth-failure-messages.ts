import { FIXED_OAUTH_ERROR_MESSAGES, OAUTH_NOT_COMPLETED_MESSAGE } from "@/lib/auth/parse-oauth-error";
import { nativeOAuthSetupHint } from "@/lib/auth/native-oauth-redirect-urls";

/**
 * Every user-facing OAuth failure string this codebase authors, in one place.
 *
 * A failure can reach a sign-in screen through `/auth/sign-in?error=oauth&message=…`, which is
 * just a query string — anyone can craft one. `oauthErrorFromParams` therefore renders a
 * `message` only when it is one of these, so the sign-in page (a credential-entry screen) can
 * never be made to display attacker-written copy. Emitters MUST build their message from here
 * rather than inline, or the allowlist silently drifts and their real explanation degrades to
 * the generic one.
 */

/**
 * Shown when an iOS build predates the WebAuthSession plugin. Such a build has no
 * chrome-free path for Google sign-in — the only alternative is SFSafariViewController,
 * which renders the PropLane portal inside an in-app Safari browser (URL bar, share
 * icon, Safari toolbar). We refuse that and ask the user to update instead.
 */
export const NATIVE_IOS_OAUTH_REBUILD_MESSAGE =
  "Google sign-in needs the latest version of the PropLane app. Please update PropLane from TestFlight or the App Store, then try again. You can also continue with Apple.";

/**
 * The iOS plugin could not find a window to anchor the auth sheet to, so nothing was
 * presented. The plugin's own reason is a developer string; this is what the user is told.
 */
export const NATIVE_IOS_OAUTH_NO_WINDOW_MESSAGE =
  "Google sign-in could not open a secure window. Bring PropLane to the front and try again, or use email and password.";

/**
 * The iOS plugin could not present the auth sheet at all — bad arguments, or
 * `ASWebAuthenticationSession.start()` returned false. Nothing was shown, and the plugin's own
 * reason is a developer string; this is what the user is told.
 */
export const NATIVE_IOS_OAUTH_START_FAILED_MESSAGE =
  "Google sign-in could not start. Please try again, or use email and password.";

export const NATIVE_OAUTH_GENERIC_FAILURE_MESSAGE = "Google sign-in could not be completed.";

/** Server `/auth/callback`: Supabase returned neither a code nor an error. */
export const OAUTH_CALLBACK_MISSING_CODE_MESSAGE =
  "Google sign-in did not return an authorization code.";

/** Server `/auth/callback`: the code/session exchange failed with no usable Supabase message. */
export const OAUTH_CALLBACK_SESSION_FAILED_MESSAGE =
  "Google sign-in session could not be established.";

export { OAUTH_NOT_COMPLETED_MESSAGE };

export function nativeOAuthUnexpectedCallbackMessage(): string {
  return `Google sign-in returned an unexpected URL. ${nativeOAuthSetupHint()}`;
}

export function nativeOAuthNoReturnMessage(): string {
  return `Google sign-in did not return to the app. ${nativeOAuthSetupHint()}`;
}

export function nativeOAuthMarketingSiteMessage(): string {
  return `Google sign-in opened the marketing site instead of the portal. ${nativeOAuthSetupHint()}`;
}

export function isAuthoredOAuthFailureMessage(message: string): boolean {
  return authoredOAuthFailureMessages().has(message);
}

function authoredOAuthFailureMessages(): Set<string> {
  return new Set<string>([
    ...FIXED_OAUTH_ERROR_MESSAGES,
    NATIVE_IOS_OAUTH_REBUILD_MESSAGE,
    NATIVE_IOS_OAUTH_NO_WINDOW_MESSAGE,
    NATIVE_IOS_OAUTH_START_FAILED_MESSAGE,
    NATIVE_OAUTH_GENERIC_FAILURE_MESSAGE,
    OAUTH_CALLBACK_MISSING_CODE_MESSAGE,
    OAUTH_CALLBACK_SESSION_FAILED_MESSAGE,
    nativeOAuthUnexpectedCallbackMessage(),
    nativeOAuthNoReturnMessage(),
    nativeOAuthMarketingSiteMessage(),
  ]);
}
