import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PREFIXES = ["/pro", "/manager", "/owner", "/resident", "/admin"];

function legacyPortalToPro(pathname: string): string | null {
  if (pathname === "/manager" || pathname === "/manager/") return "/pro/dashboard";
  if (pathname.startsWith("/manager/")) return `/pro${pathname.slice("/manager".length)}`;
  if (pathname === "/owner" || pathname === "/owner/") return "/pro/dashboard";
  if (pathname.startsWith("/owner/")) return `/pro${pathname.slice("/owner".length)}`;
  return null;
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const canonical = legacyPortalToPro(path);
  if (canonical && canonical !== path) {
    const url = request.nextUrl.clone();
    url.pathname = canonical;
    return NextResponse.redirect(url);
  }

  let supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return supabaseResponse;
  }

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options));
      },
    },
  });

  // getSession reads the JWT from the cookie — no network round-trip, no timeout risk.
  // API routes and server components call getUser() for full server-side validation.
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const needsAuth = PROTECTED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));

  if (needsAuth && !session) {
    const redirectUrl = new URL("/auth/sign-in", request.url);
    redirectUrl.searchParams.set("next", path);
    return NextResponse.redirect(redirectUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/pro/:path*", "/manager/:path*", "/owner/:path*", "/resident/:path*", "/admin/:path*"],
};
