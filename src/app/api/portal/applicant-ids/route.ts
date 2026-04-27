import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

function canLookUpApplicants(role: string | null | undefined): boolean {
  return role === "admin" || role === "manager" || role === "owner" || role === "pro";
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email")?.trim().toLowerCase() ?? "";
    if (!email) {
      return NextResponse.json({ error: "email is required" }, { status: 400 });
    }

    const auth = await createSupabaseServerClient();
    const {
      data: { user },
    } = await auth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const svc = createSupabaseServiceRoleClient();
    const { data: requestor } = await svc.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (!canLookUpApplicants(requestor?.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: profile } = await svc
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    const axisId = profile?.id ? `AXIS-R-${profile.id.slice(0, 8).toUpperCase()}` : null;
    return NextResponse.json({ axisId });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Lookup failed" },
      { status: 500 },
    );
  }
}
