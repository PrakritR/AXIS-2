import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { legacyPaidPortalToPortal } from "@/lib/legacy-portal-redirect";

const PROTECTED_PREFIXES = ["/portal", "/pro", "/manager", "/owner", "/resident", "/admin"];

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path === "/dashboard" || path === "/dashboard/") {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/continue";
    return NextResponse.redirect(url);
  }
  if (path === "/portal/resident" || path === "/portal/resident/") {
    const url = request.nextUrl.clone();
    url.pathname = "/resident/dashboard";
    return NextResponse.redirect(url);
  }

  const canonical = legacyPaidPortalToPortal(path);
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
        // Write refreshed cookies back to request so subsequent getAll() calls see them.
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
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
  matcher: ["/dashboard", "/dashboard/", "/portal/:path*", "/pro/:path*", "/manager/:path*", "/owner/:path*", "/resident/:path*", "/admin/:path*"],
};
