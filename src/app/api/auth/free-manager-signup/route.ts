import { NextResponse } from "next/server";
import { generateManagerId } from "@/lib/manager-id";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

type Body = { email: string; fullName: string; password: string; phone?: string };

export async function POST(req: Request) {
  try {
    const { email, fullName, password, phone } = (await req.json()) as Body;
    if (!email?.trim() || !fullName?.trim()) {
      return NextResponse.json({ error: "Email and full name are required." }, { status: 400 });
    }
    if (!password || password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }

    const supabase = createSupabaseServiceRoleClient();
    const managerId = generateManagerId();
    const normalEmail = email.trim().toLowerCase();
    const fakeSessionId = `free_${managerId}`;

    // Upsert manager_purchases with tier=free (no Stripe session)
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

    // Check if email already exists in auth
    let userId: string;
    const { data: created, error: cErr } = await supabase.auth.admin.createUser({
      email: normalEmail,
      password,
      email_confirm: true,
      user_metadata: { role: "manager", manager_id: managerId },
    });

    if (cErr) {
      const isAlreadyExists =
        cErr.message.toLowerCase().includes("already") ||
        cErr.message.toLowerCase().includes("registered");
      if (!isAlreadyExists) {
        return NextResponse.json({ error: cErr.message }, { status: 400 });
      }
      const { data: listData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
      const existing = listData?.users.find((u) => u.email?.toLowerCase() === normalEmail);
      if (!existing) {
        return NextResponse.json({ error: "Could not locate existing account." }, { status: 400 });
      }
      userId = existing.id;
      await supabase.auth.admin.updateUserById(userId, { password });
    } else {
      if (!created.user) return NextResponse.json({ error: "Could not create user." }, { status: 400 });
      userId = created.user.id;
    }

    await supabase.from("profiles").upsert(
      {
        id: userId,
        email: normalEmail,
        role: "manager",
        manager_id: managerId,
        full_name: fullName.trim() || null,
        application_approved: true,
      },
      { onConflict: "id" },
    );

    await supabase.from("manager_purchases").update({ user_id: userId }).eq("stripe_checkout_session_id", fakeSessionId);

    return NextResponse.json({ ok: true, managerId });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Signup failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
