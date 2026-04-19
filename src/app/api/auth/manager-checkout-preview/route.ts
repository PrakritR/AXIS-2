import { NextResponse } from "next/server";
import { isAxisIntentSessionId } from "@/lib/manager-signup-intent";
import { getStripe } from "@/lib/stripe";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

/**
 * Public read of checkout session fields needed to finish manager signup (no secrets).
 * Used by Create account after Stripe redirect or free / promo-skip intent.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("session_id")?.trim();
    if (!sessionId) {
      return NextResponse.json({ error: "session_id is required." }, { status: 400 });
    }

    if (isAxisIntentSessionId(sessionId)) {
      const supabase = createSupabaseServiceRoleClient();
      const { data: row, error } = await supabase
        .from("manager_purchases")
        .select("manager_id, email, full_name")
        .eq("stripe_checkout_session_id", sessionId)
        .maybeSingle();

      if (error || !row?.manager_id || !row.email) {
        return NextResponse.json({ error: "Unknown or expired signup link." }, { status: 400 });
      }

      return NextResponse.json({
        managerId: row.manager_id,
        email: row.email,
        fullName: row.full_name?.trim() || null,
      });
    }

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    const paid =
      session.payment_status === "paid" ||
      session.payment_status === "no_payment_required" ||
      session.status === "complete";
    if (!paid) {
      return NextResponse.json({ error: "Checkout is not complete yet." }, { status: 400 });
    }

    const managerId = session.metadata?.manager_id?.trim();
    const email = (
      session.customer_details?.email ??
      session.customer_email ??
      session.metadata?.email
    )
      ?.trim()
      .toLowerCase();
    const fullName = session.metadata?.full_name?.trim() ?? "";

    if (!managerId || !email) {
      return NextResponse.json({ error: "This session does not include manager signup details." }, { status: 400 });
    }

    return NextResponse.json({
      managerId,
      email,
      fullName: fullName || null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not load checkout session.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
