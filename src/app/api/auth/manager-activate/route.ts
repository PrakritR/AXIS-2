import { NextResponse } from "next/server";
import { findAuthUserIdByEmail } from "@/lib/auth/find-auth-user-id-by-email";
import { primaryRoleWhenAddingManager } from "@/lib/auth/profile-primary-role";
import { ensureProfileRoleRow } from "@/lib/auth/profile-role-row";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

type Body = { managerId: string; email: string; password: string };

export async function POST(req: Request) {
  try {
    const { managerId, email, password } = (await req.json()) as Body;
    if (!managerId?.trim() || !email?.trim()) {
      return NextResponse.json({ error: "Manager ID and email are required." }, { status: 400 });
    }
    if (!password || password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }

    const supabase = createSupabaseServiceRoleClient();
    const normalEmail = email.trim().toLowerCase();

    const { data: purchase, error: pErr } = await supabase
      .from("manager_purchases")
      .select("id, email, manager_id, full_name, tier, user_id")
      .eq("manager_id", managerId.trim())
      .eq("email", normalEmail)
      .maybeSingle();

    if (pErr || !purchase) {
      return NextResponse.json(
        { error: "No manager account found with that ID and email. Check your details." },
        { status: 400 },
      );
    }

    if (purchase.user_id) {
      return NextResponse.json(
        { error: "This Manager ID is already activated. Sign in instead." },
        { status: 409 },
      );
    }

    let userId: string;
    const { data: created, error: cErr } = await supabase.auth.admin.createUser({
      email: normalEmail,
      password,
      email_confirm: true,
      user_metadata: { role: "manager", manager_id: purchase.manager_id },
    });

    if (cErr) {
      const isAlreadyExists =
        cErr.message.toLowerCase().includes("already") ||
        cErr.message.toLowerCase().includes("registered");
      if (!isAlreadyExists) {
        return NextResponse.json({ error: cErr.message }, { status: 400 });
      }
      const existingId = await findAuthUserIdByEmail(supabase, normalEmail);
      if (!existingId) {
        return NextResponse.json({ error: "Could not locate existing account." }, { status: 400 });
      }
      userId = existingId;
      await supabase.auth.admin.updateUserById(userId, { password });
    } else {
      if (!created.user) return NextResponse.json({ error: "Could not create user." }, { status: 400 });
      userId = created.user.id;
    }

    const { data: existingProfile } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();

    await supabase.from("profiles").upsert(
      {
        id: userId,
        email: normalEmail,
        role: primaryRoleWhenAddingManager(existingProfile?.role as string | undefined),
        manager_id: purchase.manager_id,
        full_name: purchase.full_name || existingProfile?.full_name || null,
        application_approved: existingProfile?.application_approved ?? true,
      },
      { onConflict: "id" },
    );

    await ensureProfileRoleRow(supabase, userId, "manager");

    await supabase.from("manager_purchases").update({ user_id: userId }).eq("id", purchase.id);

    return NextResponse.json({ ok: true, managerId: purchase.manager_id });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Activation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
