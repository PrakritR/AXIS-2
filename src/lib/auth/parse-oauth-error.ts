export type OAuthUrlError = {
  error: string;
  errorCode: string | null;
  errorDescription: string | null;
};

/** Read Supabase OAuth error params from query string or hash fragment. */
export function parseOAuthErrorFromUrl(url: string | URL): OAuthUrlError | null {
  const parsed = typeof url === "string" ? new URL(url) : url;
  const fromQuery = readOAuthParams(parsed.searchParams);
  if (fromQuery) return fromQuery;

  const hash = parsed.hash.replace(/^#/, "");
  if (!hash) return null;
  return readOAuthParams(new URLSearchParams(hash));
}

function readOAuthParams(params: URLSearchParams): OAuthUrlError | null {
  const error = params.get("error")?.trim();
  if (!error) return null;
  const errorDescription = params.get("error_description")?.trim() || null;
  return {
    error,
    errorCode: params.get("error_code")?.trim() || null,
    errorDescription: errorDescription ? decodeURIComponent(errorDescription.replace(/\+/g, " ")) : null,
  };
}

export const OAUTH_EXCHANGE_FAILED_MESSAGE =
  "Google sign-in failed: Supabase could not verify your Google account. An admin must re-sync the Google Client ID and secret in Supabase → Authentication → Providers → Google, and confirm the Google Cloud redirect URI points to your Supabase project (not this website).";

export const OAUTH_REDIRECT_URI_MISMATCH_MESSAGE =
  "Google sign-in failed: redirect URI mismatch. In Google Cloud Console, add your Supabase callback URL (not your website URL) under Authorized redirect URIs.";

export const OAUTH_CANCELLED_MESSAGE = "Google sign-in was cancelled.";

export const OAUTH_NOT_COMPLETED_MESSAGE =
  "Google sign-in could not be completed. Try again or use email and password.";

/**
 * The messages `friendlyOAuthErrorMessage` can return verbatim. The remaining branch
 * interpolates a third-party `error_description`, which is never fixed copy.
 */
export const FIXED_OAUTH_ERROR_MESSAGES = [
  OAUTH_EXCHANGE_FAILED_MESSAGE,
  OAUTH_REDIRECT_URI_MISMATCH_MESSAGE,
  OAUTH_CANCELLED_MESSAGE,
  OAUTH_NOT_COMPLETED_MESSAGE,
] as const;

/** User-facing message for Supabase/Google OAuth failures. */
export function friendlyOAuthErrorMessage(oauthError: OAuthUrlError): string {
  const desc = oauthError.errorDescription?.toLowerCase() ?? "";
  if (desc.includes("unable to exchange external code")) {
    return OAUTH_EXCHANGE_FAILED_MESSAGE;
  }
  if (desc.includes("redirect_uri_mismatch")) {
    return OAUTH_REDIRECT_URI_MISMATCH_MESSAGE;
  }
  if (oauthError.error === "access_denied") {
    return OAUTH_CANCELLED_MESSAGE;
  }
  if (oauthError.errorDescription) {
    return `Google sign-in failed: ${oauthError.errorDescription}`;
  }
  return OAUTH_NOT_COMPLETED_MESSAGE;
}
