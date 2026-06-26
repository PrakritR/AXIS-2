import { completeManagerSignupFromOAuth } from "@/lib/auth/complete-manager-signup";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Body = { sessionId: string };

export async function POST(req: Request) {
  try {
    const { sessionId } = (await req.json()) as Body;
    const supabaseAuth = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();

    if (!user?.id || !user.email) {
      return NextResponse.json({ error: "Sign in with Google first." }, { status: 401 });
    }

    const service = createSupabaseServiceRoleClient();
    const result = await completeManagerSignupFromOAuth(service, user.id, user.email, sessionId);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ ok: true, managerId: result.managerId });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Signup failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
