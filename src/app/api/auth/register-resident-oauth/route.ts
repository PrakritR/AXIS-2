import { completeResidentSignupFromOAuth } from "@/lib/auth/complete-resident-signup-oauth";
import { provisionResidentAccountByEmail } from "@/lib/auth/provision-resident-account";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Body = { axisId?: string };

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

    const service = createSupabaseServiceRoleClient();

    if (axisId?.trim()) {
      const result = await completeResidentSignupFromOAuth(service, user.id, user.email, axisId.trim());
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
      return NextResponse.json({ ok: true, axisId: result.axisId });
    }

    const fullName =
      typeof user.user_metadata?.full_name === "string"
        ? user.user_metadata.full_name
        : typeof user.user_metadata?.name === "string"
          ? user.user_metadata.name
          : null;

    const result = await provisionResidentAccountByEmail(service, {
      userId: user.id,
      email: user.email,
      fullName,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ ok: true, axisId: result.axisId, linkedApplication: result.linkedApplication });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Signup failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
