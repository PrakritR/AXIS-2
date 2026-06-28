import { NextResponse } from "next/server";
import { completeResidentSignupFromOAuth } from "@/lib/auth/complete-resident-signup-oauth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

type Body = { axisId: string };

export async function POST(req: Request) {
  try {
    const { axisId } = (await req.json()) as Body;
    const supabaseAuth = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();

    if (!user?.id || !user.email) {
      return NextResponse.json({ error: "Sign in with Google first." }, { status: 401 });
    }

    if (!axisId?.trim()) {
      return NextResponse.json({ error: "Axis ID is required." }, { status: 400 });
    }

    const service = createSupabaseServiceRoleClient();
    const result = await completeResidentSignupFromOAuth(service, user.id, user.email, axisId.trim());

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ ok: true, axisId: result.axisId });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Signup failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
