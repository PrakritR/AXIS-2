import { NextResponse } from "next/server";
import { findAuthUserIdByEmail } from "@/lib/auth/find-auth-user-id-by-email";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

type Body = { email: string };

export async function POST(req: Request) {
  try {
    const { email } = (await req.json()) as Body;
    const normalEmail = email?.trim().toLowerCase();
    if (!normalEmail) {
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    }

    const supabase = createSupabaseServiceRoleClient();
    const userId = await findAuthUserIdByEmail(supabase, normalEmail);
    if (!userId) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    const [{ data: profile }, { data: roleRows }] = await Promise.all([
      supabase.from("profiles").select("role").eq("id", userId).maybeSingle(),
      supabase.from("profile_roles").select("role").eq("user_id", userId),
    ]);

    const hasResidentRole =
      profile?.role === "resident" || (roleRows ?? []).some((row) => row.role === "resident");
    if (!hasResidentRole) {
      return NextResponse.json({ error: "Only resident accounts can be auto-confirmed here." }, { status: 403 });
    }

    const { error } = await supabase.auth.admin.updateUserById(userId, { email_confirm: true });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
