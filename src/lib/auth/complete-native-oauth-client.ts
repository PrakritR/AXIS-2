import { nativeAwarePath } from "@/lib/auth/native-auth-entry";
import { normalizePostAuthPath } from "@/lib/auth/normalize-post-auth-path";
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

  const res = await fetch(accessUrl.toString(), { credentials: "include", cache: "no-store" });
  if (!res.ok) return next;
  const body = (await res.json()) as { redirectTo?: string };
  return body.redirectTo?.startsWith("/") ? body.redirectTo : next;
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
  let user = await waitForOAuthUser(supabase, { attempts: 2, delayMs: 100 });

  if (!user) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      user = await waitForOAuthUser(supabase, { attempts: 10, delayMs: 250 });
      if (!user) {
        return {
          ok: false,
          error: error.message || "Google sign-in session could not be established.",
          fallbackPath: enriched,
        };
      }
    } else {
      user = await waitForOAuthUser(supabase, { attempts: 10, delayMs: 250 });
      if (!user) {
        return {
          ok: false,
          error: "Google sign-in session could not be established.",
          fallbackPath: enriched,
        };
      }
    }
  }

  void user;
  let redirectTo = next;
  try {
    redirectTo = await resolvePortalRedirect(next, context);
  } catch {
    /* use next */
  }

  clearOAuthNextPathStorage();
  return { ok: true, redirectTo: nativeAwarePath(redirectTo) };
}
