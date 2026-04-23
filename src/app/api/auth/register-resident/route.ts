import { NextResponse } from "next/server";
import { findAuthUserIdByEmail } from "@/lib/auth/find-auth-user-id-by-email";
import { primaryRoleWhenAddingResident } from "@/lib/auth/profile-primary-role";
import { ensureProfileRoleRow } from "@/lib/auth/profile-role-row";
import { assertPasswordMatchesExistingAuthUser } from "@/lib/auth/verify-auth-password";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

type Body = {
  email: string;
  password: string;
  applicationId: string;
};

export async function POST(req: Request) {
  try {
    const { email, password, applicationId } = (await req.json()) as Body;
    const normalEmail = email?.trim().toLowerCase();
    const normalApplicationId = applicationId?.trim();

    if (!normalEmail || !normalApplicationId) {
      return NextResponse.json({ error: "Email and Application ID are required." }, { status: 400 });
    }
    if (!password || password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }

    const supabase = createSupabaseServiceRoleClient();

    const { data: created, error: cErr } = await supabase.auth.admin.createUser({
      email: normalEmail,
      password,
      email_confirm: true,
      user_metadata: {
        role: "resident",
        application_id: normalApplicationId,
      },
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
      if (!created?.user) {
        return NextResponse.json({ error: "Could not create user." }, { status: 400 });
      }
      userId = created.user.id;
    }

    const { data: existingProfile } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();

    const { error: upErr } = await supabase.from("profiles").upsert(
      {
        id: userId,
        email: normalEmail,
        role: primaryRoleWhenAddingResident(existingProfile?.role as string | undefined),
        full_name: existingProfile?.full_name ?? null,
        manager_id: existingProfile?.manager_id ?? null,
        application_approved: existingProfile?.application_approved ?? false,
      },
      { onConflict: "id" },
    );
    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 400 });
    }

    await ensureProfileRoleRow(supabase, userId, "resident");

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
