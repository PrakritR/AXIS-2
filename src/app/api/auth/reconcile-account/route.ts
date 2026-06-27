import { reconcileAuthAccountsByEmail } from "@/lib/auth/reconcile-auth-accounts-by-email";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Merge portal data for duplicate auth users that share the signed-in email (Google + password). */
export async function POST() {
  try {
    const supabaseAuth = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const service = createSupabaseServiceRoleClient();
    await reconcileAuthAccountsByEmail(service, user);

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to link accounts.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
