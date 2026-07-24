import type { OAuthSignInIntent } from "@/lib/auth/post-oauth-routing";
import { GOOGLE_CALENDAR_OAUTH_SCOPES } from "@/lib/google-calendar/scopes";

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

/** Manager Google sign-in/sign-up requests calendar access in the same OAuth step. */
export function shouldRequestGoogleCalendarOnSignIn(
  intent: OAuthSignInIntent | null | undefined,
  nextPath: string,
): boolean {
  return isManagerOAuthPath(intent, nextPath);
}

export function googleSignInOAuthOptions(
  intent: OAuthSignInIntent | null | undefined,
  nextPath: string,
): { scopes?: string; queryParams?: { access_type: string; prompt: string } } {
  if (!shouldRequestGoogleCalendarOnSignIn(intent, nextPath)) return {};
  return {
    scopes: GOOGLE_CALENDAR_OAUTH_SCOPES,
    queryParams: { access_type: "offline", prompt: "consent" },
  };
}
