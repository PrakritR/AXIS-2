import { readOAuthNextPathFromStorage, clearOAuthNextPathStorage } from "@/lib/auth/oauth-next-cookie";
import { webPathFromNativeOAuthUrl } from "@/lib/auth/native-oauth-callback";
import { isAuthCallbackUrl } from "@/lib/native/open-url";

/** Map a native deep link or universal link into a same-origin /auth/callback path. */
export function resolveNativeOAuthCallbackTarget(url: string, origin: string): string | null {
  const fromScheme = webPathFromNativeOAuthUrl(url, origin);
  if (fromScheme) {
    try {
      const parsed = new URL(fromScheme);
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch {
      return null;
    }
  }

  try {
    const parsed = new URL(url, origin);
    const pathAndQuery = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    if (!parsed.pathname.startsWith("/auth/callback")) return null;
    if (!isAuthCallbackUrl(`${parsed.origin}${pathAndQuery}`)) return null;
    return pathAndQuery;
  } catch {
    return null;
  }
}

/** Build the main WebView URL that runs the server OAuth callback (session + portal routing). */
export function buildNativeOAuthNavigationUrl(pathAndQuery: string, origin: string): string {
  const base = origin.replace(/\/$/, "");
  const url = new URL(pathAndQuery, base);

  const oauthError = url.searchParams.get("error");
  if (oauthError) {
    return `${base}${url.pathname}${url.search}${url.hash}`;
  }

  const storedNext = readOAuthNextPathFromStorage();
  clearOAuthNextPathStorage();
  if (storedNext && !url.searchParams.get("next")) {
    url.searchParams.set("next", storedNext);
  }

  return `${base}${url.pathname}${url.search}${url.hash}`;
}

export function nativeOAuthSignInFailureUrl(message: string, origin: string): string {
  const params = new URLSearchParams({
    error: "oauth",
    message,
  });
  return `${origin.replace(/\/$/, "")}/auth/sign-in?${params.toString()}`;
}
