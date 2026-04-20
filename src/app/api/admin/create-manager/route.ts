import { NextResponse } from "next/server";
import { isAdminUser } from "@/lib/auth/admin-preview";
import { findAuthUserIdByEmail } from "@/lib/auth/find-auth-user-id-by-email";
import { primaryRoleWhenAddingManager } from "@/lib/auth/profile-primary-role";
import { ensureProfileRoleRow } from "@/lib/auth/profile-role-row";
import { generateManagerId } from "@/lib/manager-id";
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
    const managerId = generateManagerId();
    const normalEmail = email.trim().toLowerCase();
    const fakeSessionId = `admin_${managerId}`;

    await supabase.from("manager_purchases").upsert(
      {
        stripe_checkout_session_id: fakeSessionId,
        stripe_customer_id: null,
        email: normalEmail,
        manager_id: managerId,
        tier: "free",
        billing: "free",
        promo_code: null,
        paid_at: new Date().toISOString(),
      },
      { onConflict: "stripe_checkout_session_id" },
    );

    const { data: created, error: cErr } = await supabase.auth.admin.createUser({
      email: normalEmail,
      password,
      email_confirm: true,
      user_metadata: { role: "manager", manager_id: managerId },
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
      userId = existingId;
      await supabase.auth.admin.updateUserById(userId, { password });
    } else {
      if (!created?.user) return NextResponse.json({ error: "Could not create user." }, { status: 400 });
      userId = created.user.id;
    }

    const { data: existingProfile } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();

    await supabase.from("profiles").upsert(
      {
        id: userId,
        email: normalEmail,
        role: primaryRoleWhenAddingManager(existingProfile?.role as string | undefined),
        manager_id: managerId,
        full_name: fullName.trim() || existingProfile?.full_name || null,
        application_approved: existingProfile?.application_approved ?? true,
      },
      { onConflict: "id" },
    );

    await ensureProfileRoleRow(supabase, userId, "manager");

    await supabase.from("manager_purchases").update({ user_id: userId }).eq("stripe_checkout_session_id", fakeSessionId);

    return NextResponse.json({ ok: true, managerId });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
