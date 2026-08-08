import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { legacyPaidPortalToPortal } from "@/lib/legacy-portal-redirect";
import { isStaleRefreshTokenError } from "@/lib/supabase/safe-browser-session";

const PROTECTED_PREFIXES = ["/portal", "/pro", "/manager", "/owner", "/resident", "/admin", "/vendor"];

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (
    process.env.NEXT_PUBLIC_AXIS_PUBLIC_DEMO_ENABLED === "false" &&
    (path === "/demo" || path.startsWith("/demo/"))
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }
  if (path === "/dashboard" || path === "/dashboard/") {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/continue";
    return NextResponse.redirect(url);
  }
  if (path === "/portal/resident" || path === "/portal/resident/") {
    const url = request.nextUrl.clone();
    url.pathname = "/resident";
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
    const response = NextResponse.next({ request });
    response.headers.set("x-pathname", path);
    return response;
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

  // Validate the session server-side so corrupt refresh cookies are cleared before portal routes run.
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError && isStaleRefreshTokenError(userError)) {
    await supabase.auth.signOut();
  }

  const needsAuth = PROTECTED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));

  if (needsAuth && !user) {
    const redirectUrl = new URL("/auth/sign-in", request.url);
    redirectUrl.searchParams.set("next", path);
    return NextResponse.redirect(redirectUrl);
  }

  supabaseResponse.headers.set("x-pathname", path);
  return supabaseResponse;
}

export const config = {
  matcher: [
    "/demo",
    "/demo/:path*",
    "/dashboard",
    "/dashboard/",
    "/portal/:path*",
    "/pro/:path*",
    "/manager/:path*",
    "/owner/:path*",
    "/resident/:path*",
    "/admin/:path*",
    "/vendor/:path*",
  ],
};
