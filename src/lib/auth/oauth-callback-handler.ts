import { reconcileAuthAccountsByEmail } from "@/lib/auth/reconcile-auth-accounts-by-email";
import { resolveOAuthPortalRedirect } from "@/lib/auth/resolve-oauth-portal-access";
import { clearOAuthNextCookie } from "@/lib/auth/oauth-next-cookie";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type PendingCookie = {
  name: string;
  value: string;
  options?: Parameters<NextResponse["cookies"]["set"]>[2];
};

function authFailureRedirect(requestUrl: URL, reason: string): NextResponse {
  const params = new URLSearchParams({ error: "oauth", message: reason });
  return NextResponse.redirect(new URL(`/auth/sign-in?${params.toString()}`, requestUrl.origin));
}

/** Exchange Supabase OAuth code for a session, then redirect to a same-origin path. */
export async function handleOAuthCallback(request: NextRequest, redirectPath: string): Promise<NextResponse> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return NextResponse.redirect(new URL("/auth/sign-in", request.url));
  }

  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const oauthError = requestUrl.searchParams.get("error");
  const oauthDescription = requestUrl.searchParams.get("error_description");

  if (oauthError) {
    const message =
      oauthDescription?.replace(/\+/g, " ").trim() ||
      "Google sign-in could not be completed. Try again or use email and password.";
    return authFailureRedirect(requestUrl, message);
  }

  if (!code) {
    return authFailureRedirect(requestUrl, "Google sign-in did not return an authorization code.");
  }

  const safePath = redirectPath.startsWith("/") ? redirectPath : "/auth/continue";
  const redirectTarget = new URL(safePath, requestUrl.origin);
  const pendingCookies: PendingCookie[] = [];
  let response = NextResponse.redirect(redirectTarget);

  function applyRedirect(target: URL) {
    response = NextResponse.redirect(target);
    pendingCookies.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, options);
    });
  }

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          pendingCookies.push({ name, value, options });
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error("OAuth callback exchange failed:", error.message);
    return authFailureRedirect(
      requestUrl,
      error.message || "Google sign-in session could not be established.",
    );
  }

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const service = createSupabaseServiceRoleClient();
      await reconcileAuthAccountsByEmail(service, user);
      const resolvedPath = await resolveOAuthPortalRedirect(service, user, safePath);
      if (resolvedPath !== safePath) {
        applyRedirect(new URL(resolvedPath, requestUrl.origin));
      }
    }
  } catch (syncError) {
    console.error("OAuth profile sync failed:", syncError);
  }

  clearOAuthNextCookie(response);
  return response;
}
