import { NextResponse } from "next/server";
import { findAuthUserIdByEmail } from "@/lib/auth/find-auth-user-id-by-email";
import { primaryRoleWhenAddingResident } from "@/lib/auth/profile-primary-role";
import { ensureProfileRoleRow } from "@/lib/auth/profile-role-row";
import { assertPasswordMatchesExistingAuthUser } from "@/lib/auth/verify-auth-password";
import { generateAxisId } from "@/lib/manager-id";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

type Body = {
  email: string;
  password: string;
  axisId?: string;
};

export async function POST(req: Request) {
  try {
    const { email, password, axisId } = (await req.json()) as Body;
    const normalEmail = email?.trim().toLowerCase();
    const normalAxisId = axisId?.trim();

    if (!normalEmail || !normalAxisId) {
      return NextResponse.json({ error: "Email and Axis ID are required." }, { status: 400 });
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
        axis_id: normalAxisId,
      },
    });

    let userId: string;
    let reusedExistingAuthUser = false;

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
      await supabase.auth.admin.updateUserById(existingId, { email_confirm: true });
      const pwCheck = await assertPasswordMatchesExistingAuthUser(normalEmail, password);
      if (!pwCheck.ok) {
        return NextResponse.json({ error: pwCheck.message }, { status: 401 });
      }
      userId = existingId;
      reusedExistingAuthUser = true;
    } else {
      if (!created?.user) {
        return NextResponse.json({ error: "Could not create user." }, { status: 400 });
      }
      userId = created.user.id;
    }

    const { data: existingProfile } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    const profileAxisId = existingProfile?.manager_id?.trim() || normalAxisId || generateAxisId();

    const { error: upErr } = await supabase.from("profiles").upsert(
      {
        id: userId,
        email: normalEmail,
        role: primaryRoleWhenAddingResident(existingProfile?.role as string | undefined),
        full_name: existingProfile?.full_name ?? null,
        manager_id: profileAxisId,
        application_approved: existingProfile?.application_approved ?? false,
      },
      { onConflict: "id" },
    );
    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 400 });
    }

    await ensureProfileRoleRow(supabase, userId, "resident");

    return NextResponse.json({ ok: true, reusedExistingAuthUser, axisId: profileAxisId });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
