import { NextResponse } from "next/server";
import { isAdminUser } from "@/lib/auth/admin-preview";
import { ensureProfileRoleRow } from "@/lib/auth/profile-role-row";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

type Body = { email: string; password: string; fullName: string };

async function requireAdmin() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  return isAdminUser(user.id);
}

export async function POST(req: Request) {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { email, password, fullName } = (await req.json()) as Body;
    if (!email?.trim() || !fullName?.trim()) {
      return NextResponse.json({ error: "Email and full name are required." }, { status: 400 });
    }
    if (!password || password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }

    const supabase = createSupabaseServiceRoleClient();
    const normalEmail = email.trim().toLowerCase();

    const { data: created, error: cErr } = await supabase.auth.admin.createUser({
      email: normalEmail,
      password,
      email_confirm: true,
      user_metadata: { role: "resident" },
    });

    if (cErr) {
      const isAlreadyExists =
        cErr.message.toLowerCase().includes("already") ||
        cErr.message.toLowerCase().includes("registered");
      if (isAlreadyExists) {
        return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
      }
      return NextResponse.json({ error: cErr.message }, { status: 400 });
    }
    if (!created?.user) return NextResponse.json({ error: "Could not create user." }, { status: 400 });
    const userId = created.user.id;

    await supabase.from("profiles").upsert(
      {
        id: userId,
        email: normalEmail,
        role: "resident",
        full_name: fullName.trim() || null,
        application_approved: false,
      },
      { onConflict: "id" },
    );

    await ensureProfileRoleRow(supabase, userId, "resident");

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
