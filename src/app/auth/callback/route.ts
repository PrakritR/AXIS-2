import { syncOAuthProfile } from "@/lib/auth/sync-oauth-profile";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function safeNextPath(raw: string | null): string {
  if (raw && raw.startsWith("/")) return raw;
  return "/auth/continue";
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

  if (!code) {
    return NextResponse.redirect(new URL("/auth/sign-in?error=auth", request.url));
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
    return NextResponse.redirect(new URL("/auth/sign-in?error=auth", request.url));
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
