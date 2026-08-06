import type { OAuthSignInIntent } from "@/lib/auth/post-oauth-routing";

export function isManagerOAuthPath(intent: OAuthSignInIntent | null | undefined, nextPath: string): boolean {
  if (intent === "manager") return true;
  if (intent === "resident" || intent === "vendor") return false;
  const path = nextPath.trim();
  if (!path.startsWith("/")) return false;
  return (
    path.startsWith("/portal") ||
    path.startsWith("/pro") ||
    path.startsWith("/partner/pricing") ||
    path.startsWith("/auth/manager") ||
    path.startsWith("/pricing")
  );
}

/** Calendar access is requested later, from the optional Google services step. */
export function shouldRequestGoogleCalendarOnSignIn(
  intent: OAuthSignInIntent | null | undefined,
  nextPath: string,
): boolean {
  void intent;
  void nextPath;
  return false;
}

export type GoogleSignInOAuthOptions = {
  scopes?: string;
  queryParams: { prompt: string; access_type?: string };
};

export function googleSignInOAuthOptions(
  intent: OAuthSignInIntent | null | undefined,
  nextPath: string,
): GoogleSignInOAuthOptions {
  void intent;
  void nextPath;
  return { queryParams: { prompt: "select_account" } };
}
