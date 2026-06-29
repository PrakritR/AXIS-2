import { NextRequest, NextResponse } from "next/server";
import { ensureFreeManagerPortalAccess } from "@/lib/auth/manager-portal-provision";
import { reconcileAuthAccountsByEmail } from "@/lib/auth/reconcile-auth-accounts-by-email";
import { resolveOAuthPortalRedirect } from "@/lib/auth/resolve-oauth-portal-access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { readOAuthIntentFromRequest, readOAuthSurfaceFromRequest } from "@/lib/auth/oauth-next-cookie";

export const runtime = "nodejs";

/** Resolve where an OAuth user may go after sign-in (portal vs pricing vs finish signup). */
export async function GET(req: NextRequest) {
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
    await reconcileAuthAccountsByEmail(service, user);
    await ensureFreeManagerPortalAccess(service, user);
    const redirectTo = await resolveOAuthPortalRedirect(service, user, intendedPath, {
      intent: readOAuthIntentFromRequest(req),
      surface: readOAuthSurfaceFromRequest(req),
    });

    return NextResponse.json({ redirectTo });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
