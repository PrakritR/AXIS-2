import { NextResponse } from "next/server";
import { findAuthUserIdByEmail } from "@/lib/auth/find-auth-user-id-by-email";
import { primaryRoleWhenAddingManager } from "@/lib/auth/profile-primary-role";
import { ensureProfileRoleRow } from "@/lib/auth/profile-role-row";
import { recordPaidManagerCheckoutSession } from "@/lib/manager-purchase-from-session";
import { isAxisIntentSessionId } from "@/lib/manager-signup-intent";
import { getStripe } from "@/lib/stripe/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

type Body = { sessionId: string; password: string };

export async function POST(req: Request) {
  try {
    const { sessionId, password } = (await req.json()) as Body;
    if (!sessionId || typeof sessionId !== "string") {
      return NextResponse.json({ error: "sessionId is required." }, { status: 400 });
    }
    if (!password || password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }

    const supabase = createSupabaseServiceRoleClient();

    if (isAxisIntentSessionId(sessionId)) {
      const { data: purchase, error: pErr } = await supabase
        .from("manager_purchases")
        .select("id, email, manager_id, user_id, full_name")
        .eq("stripe_checkout_session_id", sessionId)
        .maybeSingle();

      if (pErr || !purchase) {
        return NextResponse.json({ error: "Could not load signup for this link." }, { status: 400 });
      }
      if (purchase.user_id) {
        return NextResponse.json({ error: "This signup link was already used." }, { status: 409 });
      }

      const fullName = purchase.full_name?.trim() ?? "";
      const email = purchase.email;

      const { data: created, error: cErr } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { role: "manager", manager_id: purchase.manager_id },
      });

      let userId: string;

      if (cErr) {
        const isAlreadyExists =
          cErr.message.toLowerCase().includes("already") ||
          cErr.message.toLowerCase().includes("registered");
        if (!isAlreadyExists) {
          return NextResponse.json({ error: cErr.message }, { status: 400 });
        }
        const existingId = await findAuthUserIdByEmail(supabase, email);
        if (!existingId) {
          return NextResponse.json({ error: "Could not locate existing account for this email." }, { status: 400 });
        }
        userId = existingId;
        await supabase.auth.admin.updateUserById(userId, { password });
      } else {
        if (!created.user) {
          return NextResponse.json({ error: "Could not create user." }, { status: 400 });
        }
        userId = created.user.id;
      }

      const { data: existingProfile } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();

      const { error: upErr } = await supabase.from("profiles").upsert(
        {
          id: userId,
          email,
          role: primaryRoleWhenAddingManager(existingProfile?.role as string | undefined),
          manager_id: purchase.manager_id,
          full_name: fullName || existingProfile?.full_name || null,
          application_approved: existingProfile?.application_approved ?? true,
        },
        { onConflict: "id" },
      );

      if (upErr) {
        return NextResponse.json({ error: upErr.message }, { status: 500 });
      }

      await ensureProfileRoleRow(supabase, userId, "manager");

      const { error: linkErr } = await supabase.from("manager_purchases").update({ user_id: userId }).eq("id", purchase.id);
      if (linkErr) {
        return NextResponse.json({ error: linkErr.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true, managerId: purchase.manager_id });
    }

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    const paid =
      session.payment_status === "paid" ||
      session.payment_status === "no_payment_required" ||
      session.status === "complete";
    if (!paid) {
      return NextResponse.json({ error: "Checkout is not paid yet. Wait a moment and try again." }, { status: 400 });
    }

    await recordPaidManagerCheckoutSession(session);

    const { data: purchase, error: pErr } = await supabase
      .from("manager_purchases")
      .select("id, email, manager_id, user_id")
      .eq("stripe_checkout_session_id", sessionId)
      .maybeSingle();

    if (pErr || !purchase) {
      return NextResponse.json({ error: "Could not load purchase for this checkout session." }, { status: 400 });
    }
    if (purchase.user_id) {
      return NextResponse.json({ error: "This checkout was already used to create an account." }, { status: 409 });
    }

    const fullName = session.metadata?.full_name?.trim() ?? "";
    const email = purchase.email;

    let userId: string;

    // Try creating a new auth user; if email already exists, reuse that user.
    const { data: created, error: cErr } = await supabase.auth.admin.createUser({
      email,
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
      const existingId = await findAuthUserIdByEmail(supabase, email);
      if (!existingId) {
        return NextResponse.json({ error: "Could not locate existing account for this email." }, { status: 400 });
      }
      userId = existingId;
      await supabase.auth.admin.updateUserById(userId, { password });
    } else {
      if (!created.user) {
        return NextResponse.json({ error: "Could not create user." }, { status: 400 });
      }
      userId = created.user.id;
    }

    const { data: existingProfile } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();

    const { error: upErr } = await supabase.from("profiles").upsert(
      {
        id: userId,
        email,
        role: primaryRoleWhenAddingManager(existingProfile?.role as string | undefined),
        manager_id: purchase.manager_id,
        full_name: fullName || existingProfile?.full_name || null,
        application_approved: existingProfile?.application_approved ?? true,
      },
      { onConflict: "id" },
    );

    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    await ensureProfileRoleRow(supabase, userId, "manager");

    const { error: linkErr } = await supabase.from("manager_purchases").update({ user_id: userId }).eq("id", purchase.id);
    if (linkErr) {
      return NextResponse.json({ error: linkErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, managerId: purchase.manager_id });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Signup failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
