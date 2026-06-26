import { syncOAuthProfile } from "@/lib/auth/sync-oauth-profile";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function safeNextPath(raw: string | null): string {
  if (raw && raw.startsWith("/")) return raw;
  return "/auth/continue";
}

function authFailureRedirect(requestUrl: URL, reason: string): NextResponse {
  const params = new URLSearchParams({ error: "oauth", message: reason });
  return NextResponse.redirect(new URL(`/auth/sign-in?${params.toString()}`, requestUrl.origin));
}

export async function GET(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return NextResponse.redirect(new URL("/auth/sign-in", request.url));
  }

  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = safeNextPath(requestUrl.searchParams.get("next"));
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

  const redirectTarget = new URL(next, requestUrl.origin);
  let response = NextResponse.redirect(redirectTarget);

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
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
      await syncOAuthProfile(service, user);
    }
  } catch (syncError) {
    console.error("OAuth profile sync failed:", syncError);
  }

  return response;
}
