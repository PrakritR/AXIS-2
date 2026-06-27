import { provisionPendingManagerAccount } from "@/lib/auth/manager-onboarding";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function oauthFullName(meta: Record<string, unknown> | null | undefined): string | null {
  const fullName = typeof meta?.full_name === "string" ? meta.full_name.trim() : "";
  if (fullName) return fullName;
  const name = typeof meta?.name === "string" ? meta.name.trim() : "";
  return name || null;
}

/** Links Google OAuth user to a pending manager account, then sends them to pricing. */
export async function POST() {
  try {
    const supabaseAuth = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();

    if (!user?.id || !user.email) {
      return NextResponse.json({ error: "Sign in with Google first." }, { status: 401 });
    }

    const service = createSupabaseServiceRoleClient();
    const { managerId } = await provisionPendingManagerAccount(service, {
      userId: user.id,
      email: user.email,
      fullName: oauthFullName(user.user_metadata),
    });

    return NextResponse.json({ ok: true, managerId, redirectTo: "/partner/pricing" });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not create manager account.";
    const status = message.includes("already exists") ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
