import { NextResponse } from "next/server";
import { recordPaidManagerCheckoutSession } from "@/lib/manager-purchase-from-session";
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

    const supabase = createSupabaseServiceRoleClient();
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

    const { data: created, error: cErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role: "manager", manager_id: purchase.manager_id },
    });

    if (cErr || !created.user) {
      return NextResponse.json({ error: cErr?.message ?? "Could not create user." }, { status: 400 });
    }

    const userId = created.user.id;

    const { error: upErr } = await supabase.from("profiles").upsert(
      {
        id: userId,
        email,
        role: "manager",
        manager_id: purchase.manager_id,
        full_name: fullName || null,
        application_approved: true,
      },
      { onConflict: "id" },
    );

    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

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
