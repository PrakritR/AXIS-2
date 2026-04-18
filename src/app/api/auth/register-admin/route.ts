import { NextResponse } from "next/server";
import { isValidAdminRegisterKey } from "@/lib/auth/resolve-portal-role";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

type Body = { email: string; password: string; adminKey: string; fullName?: string };

export async function POST(req: Request) {
  try {
    const { email, password, adminKey, fullName } = (await req.json()) as Body;
    if (!isValidAdminRegisterKey(adminKey ?? "")) {
      return NextResponse.json({ error: "Invalid admin registration key." }, { status: 401 });
    }
    if (!email?.trim() || !password || password.length < 8) {
      return NextResponse.json({ error: "Valid email and password (8+ chars) required." }, { status: 400 });
    }

    const supabase = createSupabaseServiceRoleClient();
    const { data, error } = await supabase.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: true,
      user_metadata: { role: "admin" },
    });
    if (error || !data.user) {
      return NextResponse.json({ error: error?.message ?? "Could not create user." }, { status: 400 });
    }

    const { error: pErr } = await supabase.from("profiles").upsert(
      {
        id: data.user.id,
        email: email.trim().toLowerCase(),
        role: "admin",
        full_name: fullName?.trim() || null,
        application_approved: true,
      },
      { onConflict: "id" },
    );
    if (pErr) {
      return NextResponse.json({ error: pErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Registration failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
