import { NextResponse } from "next/server";
import { resolveOAuthPortalRedirect } from "@/lib/auth/resolve-oauth-portal-access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

/** Resolve where an OAuth user may go after sign-in (portal vs pricing vs finish signup). */
export async function GET(req: Request) {
  try {
    const supabaseAuth = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const url = new URL(req.url);
    const next = url.searchParams.get("next")?.trim() ?? "/auth/continue";
    const intendedPath = next.startsWith("/") ? next : "/auth/continue";

    const service = createSupabaseServiceRoleClient();
    const redirectTo = await resolveOAuthPortalRedirect(service, user, intendedPath);

    return NextResponse.json({ redirectTo });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
