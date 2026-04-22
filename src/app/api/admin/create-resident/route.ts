import { NextResponse } from "next/server";
import { isAdminUser } from "@/lib/auth/admin-preview";
import { findAuthUserIdByEmail } from "@/lib/auth/find-auth-user-id-by-email";
import { assertPasswordMatchesExistingAuthUser } from "@/lib/auth/verify-auth-password";
import { primaryRoleWhenAddingResident } from "@/lib/auth/profile-primary-role";
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

    let userId: string;

    if (cErr) {
      const isAlreadyExists =
        cErr.message.toLowerCase().includes("already") ||
        cErr.message.toLowerCase().includes("registered");
      if (!isAlreadyExists) {
        return NextResponse.json({ error: cErr.message }, { status: 400 });
      }
      const existingId = await findAuthUserIdByEmail(supabase, normalEmail);
      if (!existingId) {
        return NextResponse.json({ error: "Could not locate existing account for this email." }, { status: 400 });
      }
      const pwCheck = await assertPasswordMatchesExistingAuthUser(normalEmail, password);
      if (!pwCheck.ok) {
        return NextResponse.json({ error: pwCheck.message }, { status: 401 });
      }
      userId = existingId;
    } else {
      if (!created?.user) return NextResponse.json({ error: "Could not create user." }, { status: 400 });
      userId = created.user.id;
    }

    const { data: existingProfile } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();

    await supabase.from("profiles").upsert(
      {
        id: userId,
        email: normalEmail,
        role: primaryRoleWhenAddingResident(existingProfile?.role as string | undefined),
        manager_id: existingProfile?.manager_id ?? null,
        full_name: fullName.trim() || existingProfile?.full_name || null,
        application_approved: existingProfile?.application_approved ?? false,
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
