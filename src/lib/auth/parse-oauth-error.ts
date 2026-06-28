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

/** User-facing message for Supabase/Google OAuth failures. */
export function friendlyOAuthErrorMessage(oauthError: OAuthUrlError): string {
  const desc = oauthError.errorDescription?.toLowerCase() ?? "";
  if (desc.includes("unable to exchange external code")) {
    return "Google sign-in failed: Supabase could not verify your Google account. An admin must re-sync the Google Client ID and secret in Supabase → Authentication → Providers → Google, and confirm the Google Cloud redirect URI points to your Supabase project (not this website).";
  }
  if (desc.includes("redirect_uri_mismatch")) {
    return "Google sign-in failed: redirect URI mismatch. In Google Cloud Console, add your Supabase callback URL (not your website URL) under Authorized redirect URIs.";
  }
  if (oauthError.error === "access_denied") {
    return "Google sign-in was cancelled.";
  }
  if (oauthError.errorDescription) {
    return `Google sign-in failed: ${oauthError.errorDescription}`;
  }
  return "Google sign-in could not be completed. Try again or use email and password.";
}
