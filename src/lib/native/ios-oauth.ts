import { detectNativePlatformSync } from "@/lib/native/detect-native";

/**
 * iOS native OAuth uses ASWebAuthenticationSession instead of SFSafariViewController.
 *
 * The ONE gate for that decision: `resolveOAuthCallbackRedirectUrl` picks `redirect_to` with it
 * and `openOAuthUrl` picks the transport with it, and those two must never disagree. Reads the
 * injected `window.Capacitor` global the same way `detectNativePlatformSync` does rather than
 * importing `@capacitor/core`, so the `/auth/callback*` server route handlers — which reach this
 * module through `native-oauth-callback` — never pull the browser-only Capacitor SDK into the
 * server bundle.
 */
export function usesIosAsWebAuthenticationSession(): boolean {
  if (typeof window === "undefined") return false;
  if (detectNativePlatformSync() !== "ios") return false;
  try {
    const cap = (
      window as Window & { Capacitor?: { isPluginAvailable?: (name: string) => boolean } }
    ).Capacitor;
    return cap?.isPluginAvailable?.("WebAuthSession") === true;
  } catch {
    return false;
  }
}
