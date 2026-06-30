import { nativeAwarePath } from "@/lib/auth/native-auth-entry";
import {
  failClosedOAuthContinuePath,
  normalizePostAuthPath,
} from "@/lib/auth/normalize-post-auth-path";
import {
  clearOAuthNextPathStorage,
  readOAuthIntentFromStorage,
  readOAuthNextPathFromStorage,
  readOAuthSurfaceFromStorage,
} from "@/lib/auth/oauth-next-cookie";
import { waitForOAuthUser } from "@/lib/auth/wait-for-oauth-user";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export type NativeOAuthCompletionResult =
  | { ok: true; redirectTo: string }
  | { ok: false; error: string; fallbackPath?: string };

/** Preserve sign-in intent on the callback URL — cookies must not be cleared before exchange. */
export function appendOAuthContextToCallbackPath(pathAndQuery: string, origin: string): string {
  const url = new URL(pathAndQuery, origin);

  const storedNext = readOAuthNextPathFromStorage();
  const intent = readOAuthIntentFromStorage();
  const surface = readOAuthSurfaceFromStorage();

  if (storedNext && !url.searchParams.get("next")) {
    url.searchParams.set("next", normalizePostAuthPath(storedNext));
  }
  if (intent && !url.searchParams.get("oauth_intent")) {
    url.searchParams.set("oauth_intent", intent);
  }
  if (surface && !url.searchParams.get("oauth_surface")) {
    url.searchParams.set("oauth_surface", surface);
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

async function resolvePortalRedirect(next: string, context: { intent: string | null; surface: string | null }): Promise<string> {
  const accessUrl = new URL("/api/auth/oauth-portal-access", window.location.origin);
  accessUrl.searchParams.set("next", next);
  if (context.intent) accessUrl.searchParams.set("oauth_intent", context.intent);
  if (context.surface) accessUrl.searchParams.set("oauth_surface", context.surface);

  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(accessUrl.toString(), { credentials: "include", cache: "no-store" });
    if (res.ok) {
      const body = (await res.json()) as { redirectTo?: string };
      const candidate = body.redirectTo?.startsWith("/") ? normalizePostAuthPath(body.redirectTo) : next;
      return candidate;
    }
    // Session cookies can land a tick after the client-side code exchange on first sign-in.
    if (res.status === 401 && attempt < 5) {
      await new Promise((resolve) => window.setTimeout(resolve, 150 + attempt * 200));
      continue;
    }
    break;
  }

  return failClosedOAuthContinuePath(next);
}

/**
 * Finish Google OAuth inside the Capacitor WebView.
 * Client-side PKCE exchange keeps the code verifier in the same context that started sign-in.
 */
export async function completeNativeOAuthInWebView(pathAndQuery: string): Promise<NativeOAuthCompletionResult> {
  const origin = window.location.origin;
  const enriched = appendOAuthContextToCallbackPath(pathAndQuery, origin);
  const url = new URL(enriched, origin);

  const oauthError = url.searchParams.get("error");
  if (oauthError) {
    const message =
      url.searchParams.get("error_description")?.replace(/\+/g, " ").trim() ||
      "Google sign-in could not be completed.";
    return { ok: false, error: message };
  }

  const code = url.searchParams.get("code");
  if (!code) {
    return { ok: false, error: "Google sign-in did not return an authorization code." };
  }

  const nextParam = url.searchParams.get("next");
  const next = nextParam?.startsWith("/") ? normalizePostAuthPath(nextParam) : "/auth/continue";
  const context = {
    intent: url.searchParams.get("oauth_intent"),
    surface: url.searchParams.get("oauth_surface"),
  };

  const supabase = createSupabaseBrowserClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    return {
      ok: false,
      error: exchangeError.message || "Google sign-in session could not be established.",
      fallbackPath: enriched,
    };
  }

  const user = await waitForOAuthUser(supabase, { attempts: 10, delayMs: 250 });
  if (!user) {
    return {
      ok: false,
      error: "Google sign-in session could not be established.",
      fallbackPath: enriched,
    };
  }

  void user;
  let redirectTo: string;
  try {
    redirectTo = await resolvePortalRedirect(next, context);
  } catch {
    redirectTo = failClosedOAuthContinuePath(next);
  }

  clearOAuthNextPathStorage();
  return { ok: true, redirectTo: nativeAwarePath(redirectTo) };
}
